// The ranges the usage history can be read over. Pure, so the range switcher and the page can
// share them without pulling in the database code in lib/usage-rollup.ts.

/** Days covered by each range; `all` (null) is everything since the first rollup. */
export const USAGE_RANGES = { "7d": 7, "30d": 30, "90d": 90, all: null } as const;
export type UsageRange = keyof typeof USAGE_RANGES;
export const DEFAULT_USAGE_RANGE: UsageRange = "7d";

export function parseUsageRange(value: unknown): UsageRange {
  return typeof value === "string" && value in USAGE_RANGES ? (value as UsageRange) : DEFAULT_USAGE_RANGE;
}
