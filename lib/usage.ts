import { executeSql, sql } from "./db-sql";
import { getPayloadClient } from "./payload";

// The daily tool-call meter (PRICING_PLAN.md): one `usage_daily` row per organisation per UTC
// day, counting the MCP tool calls that ran. Read by the plan page; written by
// lib/mcp-activity.ts before each call runs. Like lib/activity.ts this uses
// overrideAccess/raw SQL, so organisationId must come from authenticated server-side context.

/** Rows older than this are deleted by /api/cron/usage-cleanup. */
export const USAGE_RETENTION_DAYS = 90;

/** The UTC day a call counts against; the allowance resets at 00:00 UTC. */
export function usageDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Counts one tool call against today's allowance, atomically: a single upsert that only
 * increments while the count is below `limit`, so concurrent calls can never overshoot it and
 * calls refused at the limit don't keep inflating the count. Raw SQL because the local API
 * can't do a conditional increment as one statement, and a read-then-write would race.
 */
export async function consumeToolCall(
  organisationId: string,
  limit: number,
  now: Date = new Date()
): Promise<{ allowed: boolean }> {
  if (limit < 1) return { allowed: false };

  const result = await executeSql(sql`
    INSERT INTO "usage_daily" ("organisation_id", "day", "tool_calls", "created_at", "updated_at")
    VALUES (${Number(organisationId)}, ${usageDay(now)}, 1, now(), now())
    ON CONFLICT ("organisation_id", "day") DO UPDATE
      SET "tool_calls" = "usage_daily"."tool_calls" + 1, "updated_at" = now()
      WHERE "usage_daily"."tool_calls" < ${limit}
    RETURNING "tool_calls"
  `);
  return { allowed: result.rowCount > 0 };
}

/** Tool calls this organisation has made so far today (UTC). */
export async function getToolCallsToday(organisationId: string, now: Date = new Date()): Promise<number> {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "usage-daily",
    where: { organisation: { equals: organisationId }, day: { equals: usageDay(now) } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return Number(result.docs[0]?.toolCalls ?? 0);
}

/** Deletes meter rows past the retention window. Returns how many were removed. Run daily by /api/cron/usage-cleanup. */
export async function purgeExpiredUsage(now: Date = new Date()): Promise<number> {
  const cutoff = usageDay(new Date(now.getTime() - USAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000));
  const result = await executeSql(sql`DELETE FROM "usage_daily" WHERE "day" < ${cutoff}`);
  return result.rowCount;
}
