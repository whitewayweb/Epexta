import { runNeutralChecks } from "./providers/neutral";
import { yoastAdapter } from "./providers/yoast";
import type { SeoCheck, SeoCheckInput, SeoCheckResult, SeoProfile } from "./types";

/**
 * Neutral checks always run; provider-aligned checks only run once that provider is
 * confirmed - a site with no detected plugin gets no keyphrase-driven noise it can't
 * actually act on natively.
 */
export function runSeoChecks(input: SeoCheckInput, profile: SeoProfile): SeoCheckResult {
  const checks: SeoCheck[] = [...runNeutralChecks(input)];

  if (profile.state === "confirmed" && profile.providerId === "yoast") {
    checks.push(...yoastAdapter.checks(input, profile.capabilities));
  }

  const bad = checks.filter((c) => c.status === "bad").length;
  const ok = checks.filter((c) => c.status === "ok").length;
  const score: SeoCheckResult["score"] = checks.length === 0 ? "not-set" : bad > 0 ? "poor" : ok > 0 ? "ok" : "good";

  return { score, checks };
}
