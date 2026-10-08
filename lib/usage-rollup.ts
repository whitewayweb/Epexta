import type { Where } from "payload";
import { executeSql, sql } from "./db-sql";
import { getPayloadClient } from "./payload";
import { USAGE_RANGES, type UsageRange } from "./usage-ranges";

// The long-term usage history (collections/UsageRollups.ts). Raw events in the activity log
// are pruned after ACTIVITY_RETENTION_DAYS (lib/activity.ts); before that, the daily cron
// folds every finished UTC day into one row per organisation, module and tool here, and
// purgeExpiredActivity refuses to delete anything this hasn't folded in yet. Like the rest of
// lib/usage*.ts this uses overrideAccess/raw SQL, so organisationId must come from
// authenticated server-side context.

/** Days re-folded on every run, so events written just after midnight (logging runs after the response) are still counted. */
const REFOLD_DAYS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfUtcDay(day: string): string {
  return `${day}T00:00:00.000Z`;
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The latest day folded so far, or null before the first run. */
async function latestRolledUpDay(): Promise<string | null> {
  const { rows } = await executeSql<{ day: string | null }>(sql`SELECT max("day") AS "day" FROM "usage_rollups"`);
  return rows[0]?.day ?? null;
}

/**
 * Folds the activity log into `usage_rollups` for every finished UTC day since the last run
 * (re-folding the last couple of days), and returns how many rollup rows were written.
 *
 * Each day is recomputed from its events and overwritten, never incremented, so running it
 * twice, or after missed days, gives the same result. Missed days are caught up from the
 * activity log's retention window, so a cron outage never loses history unless it outlasts
 * the raw events themselves. Today is never folded: it isn't finished.
 */
export async function rollUpActivity(now: Date = new Date()): Promise<number> {
  const latest = await latestRolledUpDay();
  const from = latest ? startOfUtcDay(utcDay(new Date(new Date(startOfUtcDay(latest)).getTime() - REFOLD_DAYS * DAY_MS))) : startOfUtcDay("1970-01-01");
  const to = startOfUtcDay(utcDay(now));

  const result = await executeSql(sql`
    INSERT INTO "usage_rollups"
      ("organisation_id", "day", "module", "tool", "kind", "calls", "failures", "plan_limited", "created_at", "updated_at")
    SELECT
      "organisation_id",
      to_char("created_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
      "module"::text,
      "tool",
      "kind"::text,
      count(*),
      count(*) FILTER (WHERE "outcome" = 'failure'),
      count(*) FILTER (WHERE "error_code" = 'plan_limit'),
      now(),
      now()
    FROM "activity_events"
    WHERE "created_at" >= ${from}::timestamptz AND "created_at" < ${to}::timestamptz
    GROUP BY 1, 2, 3, 4, 5
    ON CONFLICT ("organisation_id", "day", "module", "tool") DO UPDATE SET
      "kind" = EXCLUDED."kind",
      "calls" = EXCLUDED."calls",
      "failures" = EXCLUDED."failures",
      "plan_limited" = EXCLUDED."plan_limited",
      "updated_at" = now()
  `);
  return result.rowCount;
}

/**
 * The instant before which every activity event has been folded into the rollup (the end of
 * the latest folded day), or null when nothing has been folded yet. The only safe upper bound
 * for deleting raw events.
 */
export async function rolledUpThrough(): Promise<Date | null> {
  const latest = await latestRolledUpDay();
  return latest ? new Date(new Date(startOfUtcDay(latest)).getTime() + DAY_MS) : null;
}

export interface UsageHistory {
  /** First and last day covered, inclusive (UTC); empty strings when there is no history yet. */
  from: string;
  to: string;
  calls: number;
  failures: number;
  /** One entry per day from `from` to `to`, zero-filled, oldest first. */
  days: { day: string; calls: number; failures: number }[];
  /** Calls per tool over the period, busiest first. */
  tools: { module: string; tool: string; calls: number; failures: number }[];
}

/**
 * An organisation's usage over a range of finished UTC days (up to yesterday), read from the
 * rollup. A fixed range always spans that many days, zero-filled; `all` starts at the
 * organisation's first rolled-up day.
 */
export async function getUsageHistory(organisationId: string, range: UsageRange, now: Date = new Date()): Promise<UsageHistory> {
  const rangeDays = USAGE_RANGES[range];
  const to = utcDay(new Date(now.getTime() - DAY_MS));
  const conditions: Where[] = [{ organisation: { equals: organisationId } }, { day: { less_than_equal: to } }];
  if (rangeDays) conditions.push({ day: { greater_than_equal: utcDay(new Date(now.getTime() - rangeDays * DAY_MS)) } });

  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "usage-rollups",
    where: { and: conditions },
    select: { day: true, module: true, tool: true, calls: true, failures: true },
    sort: "day",
    depth: 0,
    limit: 0,
    pagination: false,
    overrideAccess: true,
  });

  const byDay = new Map<string, { calls: number; failures: number }>();
  const byTool = new Map<string, UsageHistory["tools"][number]>();
  for (const row of result.docs) {
    const calls = Number(row.calls);
    const failures = Number(row.failures);
    const dayTotal = byDay.get(row.day) ?? { calls: 0, failures: 0 };
    dayTotal.calls += calls;
    dayTotal.failures += failures;
    byDay.set(row.day, dayTotal);

    const key = `${row.module}:${row.tool}`;
    const entry = byTool.get(key) ?? { module: row.module, tool: row.tool, calls: 0, failures: 0 };
    entry.calls += calls;
    entry.failures += failures;
    byTool.set(key, entry);
  }

  const first = rangeDays ? utcDay(new Date(now.getTime() - rangeDays * DAY_MS)) : result.docs[0]?.day;
  const days: UsageHistory["days"] = [];
  if (first) {
    for (let t = new Date(startOfUtcDay(first)).getTime(); t <= new Date(startOfUtcDay(to)).getTime(); t += DAY_MS) {
      const day = utcDay(new Date(t));
      days.push({ day, ...(byDay.get(day) ?? { calls: 0, failures: 0 }) });
    }
  }

  return {
    from: first ?? "",
    to: first ? to : "",
    calls: days.reduce((sum, d) => sum + d.calls, 0),
    failures: days.reduce((sum, d) => sum + d.failures, 0),
    days,
    tools: [...byTool.values()].sort((a, b) => b.calls - a.calls),
  };
}
