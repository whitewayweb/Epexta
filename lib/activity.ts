import type { Where } from "payload";
import { getPayloadClient } from "./payload";
import { executeSql, sql } from "./db-sql";
import type { OrganisationRole } from "./members";
import type { ModuleSlug } from "./modules";
import { rolledUpThrough } from "./plans/usage-rollup";
import type { ActivityEvent } from "../payload-types";

// The activity log (ACTIVITY_LOG_PLAN.md): what AI apps did through MCP tools, per
// organisation. Writes come from lib/mcp-activity.ts after a tool call has responded;
// reads are scoped here - an organisation admin sees every event, a member only their own.
// Like lib/entitlements.ts this uses overrideAccess: true, so organisationId and the viewer
// must already come from authenticated server-side context, never from a client value.

/** Events older than this are deleted by /api/cron/activity-cleanup. */
export const ACTIVITY_RETENTION_DAYS = 180;

export type ActivityKind = "read" | "create" | "update";

export interface ActivityInput {
  organisationId: string;
  userId: string;
  module: ModuleSlug;
  tool: string;
  kind: ActivityKind;
  outcome: "success" | "failure";
  summary: string;
  siteLabel?: string | null;
  source: "api-key" | "oauth";
  /** The OAuth client the call came in through; resolved to its display name when stored. */
  oauthClientId?: string | null;
  errorCode?: "not_enabled" | "plan_limit" | "tool_error" | null;
  durationMs?: number;
}

export interface ActivityViewer {
  userId: string;
  role: OrganisationRole;
}

export interface ActivityItem {
  id: string;
  createdAt: string;
  module: ModuleSlug;
  tool: string;
  kind: ActivityKind;
  outcome: "success" | "failure";
  summary: string;
  siteLabel: string | null;
  actorLabel: string | null;
  client: string | null;
  source: "api-key" | "oauth";
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/** What identifies the person in the feed: their name, else the part of their email before the "@". */
function actorLabelFor(user: { name?: string | null; email: string }): string {
  return user.name?.trim() || user.email.split("@")[0];
}

/**
 * Stores one event. Never throws into a tool call: callers run it through
 * `runAfterResponse`, which logs a failure instead of surfacing it.
 */
export async function recordActivity(input: ActivityInput): Promise<void> {
  const payload = await getPayloadClient();

  const [user, client] = await Promise.all([
    payload
      .findByID({ collection: "users", id: input.userId, depth: 0, overrideAccess: true })
      .catch(() => null),
    input.oauthClientId
      ? payload
          .find({
            collection: "oauth-clients",
            where: { clientId: { equals: input.oauthClientId } },
            limit: 1,
            depth: 0,
            overrideAccess: true,
          })
          .then((result) => result.docs[0] ?? null)
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  await payload.create({
    collection: "activity-events",
    data: {
      organisation: Number(input.organisationId),
      user: user ? Number(input.userId) : null,
      actorLabel: user ? truncate(actorLabelFor(user), 120) : null,
      module: input.module,
      tool: truncate(input.tool, 80),
      kind: input.kind,
      outcome: input.outcome,
      summary: truncate(input.summary, 200),
      siteLabel: input.siteLabel ? truncate(input.siteLabel, 200) : null,
      source: input.source,
      client: client ? truncate(client.clientName, 120) : null,
      errorCode: input.errorCode ?? null,
      durationMs: input.durationMs === undefined ? null : Math.round(input.durationMs),
    },
    overrideAccess: true,
  });
}

function visibleTo(organisationId: string, viewer: ActivityViewer) {
  const conditions: Where[] = [{ organisation: { equals: organisationId } }];
  if (viewer.role !== "admin") conditions.push({ user: { equals: viewer.userId } });
  return conditions;
}

function toItem(doc: ActivityEvent): ActivityItem {
  return {
    id: String(doc.id),
    createdAt: doc.createdAt,
    module: doc.module,
    tool: doc.tool,
    kind: doc.kind,
    outcome: doc.outcome,
    summary: doc.summary,
    siteLabel: doc.siteLabel ?? null,
    actorLabel: doc.actorLabel ?? null,
    client: doc.client ?? null,
    source: doc.source,
  };
}

export interface ListActivityOptions {
  limit?: number;
  module?: ModuleSlug;
  outcome?: "success" | "failure";
  /** Writes (create/update) and failures only - what the dashboard feed shows; reads stay countable. */
  hideSuccessfulReads?: boolean;
  /** Cursor from a previous page: the `createdAt` and `id` of its last item. */
  before?: { createdAt: string; id: string };
}

/** Newest first. Pass the last item's `createdAt`/`id` as `before` for the next page. */
export async function listActivity(
  organisationId: string,
  viewer: ActivityViewer,
  options: ListActivityOptions = {}
): Promise<ActivityItem[]> {
  const payload = await getPayloadClient();
  const conditions = visibleTo(organisationId, viewer);
  if (options.module) conditions.push({ module: { equals: options.module } });
  if (options.outcome) conditions.push({ outcome: { equals: options.outcome } });
  if (options.hideSuccessfulReads) {
    conditions.push({ or: [{ kind: { not_equals: "read" } }, { outcome: { equals: "failure" } }] });
  }
  if (options.before) {
    conditions.push({
      or: [
        { createdAt: { less_than: options.before.createdAt } },
        { and: [{ createdAt: { equals: options.before.createdAt } }, { id: { less_than: options.before.id } }] },
      ],
    });
  }

  const result = await payload.find({
    collection: "activity-events",
    where: { and: conditions },
    sort: ["-createdAt", "-id"],
    limit: options.limit ?? 20,
    depth: 0,
    overrideAccess: true,
  });
  return result.docs.map(toItem);
}

export async function countActivity(
  organisationId: string,
  viewer: ActivityViewer,
  options: { sinceDays: number; outcome?: "success" | "failure"; kinds?: ActivityKind[] }
): Promise<number> {
  const payload = await getPayloadClient();
  const since = new Date(Date.now() - options.sinceDays * 24 * 60 * 60 * 1000).toISOString();
  const conditions = [...visibleTo(organisationId, viewer), { createdAt: { greater_than_equal: since } }];
  if (options.outcome) conditions.push({ outcome: { equals: options.outcome } });
  if (options.kinds) conditions.push({ kind: { in: options.kinds } });

  const { totalDocs } = await payload.count({
    collection: "activity-events",
    where: { and: conditions },
    overrideAccess: true,
  });
  return totalDocs;
}

/**
 * Deletes events past the retention window (a raw bulk delete: the local API would load
 * every row it deletes), but never an event the usage rollup hasn't folded in yet
 * (lib/usage-rollup.ts) - the raw events are the only copy until then, so a failed or missed
 * rollup delays the purge instead of losing history. Returns how many were removed. Run daily
 * by /api/cron/activity-cleanup, after the rollup.
 */
export async function purgeExpiredActivity(now: Date = new Date()): Promise<number> {
  const rolledUp = await rolledUpThrough();
  if (!rolledUp) return 0;

  const retentionCutoff = now.getTime() - ACTIVITY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const cutoff = new Date(Math.min(retentionCutoff, rolledUp.getTime())).toISOString();
  const result = await executeSql(sql`DELETE FROM "activity_events" WHERE "created_at" < ${cutoff}::timestamptz`);
  return result.rowCount;
}
