// Epexta's plans (PRICING_PLAN.md): what each tier allows. Pure data and rules - no database
// access - so collection configs can import it (collections/OrganisationPlans.ts) and the
// resolution rules are unit-testable. lib/organisation-plan.ts is where a plan is read.
//
// Modules never see a plan name: they ask for limits (`maxSites`, `dailyToolCalls`) through
// the helpers that enforce them, so billing and tiers can change without touching a module.

export interface PlanDefinition {
  slug: string;
  name: string;
  /** WordPress sites an organisation may have connected, across all of its members. */
  maxSites: number;
  /** MCP tool calls per organisation per UTC day (lib/usage.ts). */
  dailyToolCalls: number;
}

export const PLANS = [
  { slug: "free", name: "Free", maxSites: 1, dailyToolCalls: 100 },
  { slug: "pro", name: "Pro", maxSites: 5, dailyToolCalls: 500 },
  { slug: "agency", name: "Agency", maxSites: 25, dailyToolCalls: 5000 },
] as const satisfies readonly PlanDefinition[];

export type PlanSlug = (typeof PLANS)[number]["slug"];

/** What an organisation with no plan record - every new signup - is on. */
export const DEFAULT_PLAN: PlanSlug = "free";

export const PLAN_STATUSES = ["active", "suspended"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

/** A stored plan record, as much of it as resolution needs. */
export interface PlanRecord {
  plan: PlanSlug;
  status: PlanStatus;
  /** When a paid period ends; after it the organisation falls back to the default plan. */
  currentPeriodEnd?: string | null;
  /** Set by support/billing to tailor a plan, e.g. an Agency with a second 25-site pack. */
  maxSitesOverride?: number | null;
  dailyToolCallsOverride?: number | null;
}

export interface EffectivePlan {
  slug: PlanSlug;
  name: string;
  maxSites: number;
  dailyToolCalls: number;
}

function definitionOf(slug: PlanSlug): (typeof PLANS)[number] {
  return PLANS.find((plan) => plan.slug === slug) ?? PLANS.find((plan) => plan.slug === DEFAULT_PLAN)!;
}

/**
 * The plan an organisation is actually on right now. A missing record, a suspended one, or
 * a paid period that has ended all resolve to the default plan, so access never depends on
 * a cron job having noticed the change - it takes effect on the next request. Limits apply
 * to what an organisation can add or use from now on; nothing it already has is removed.
 */
export function resolvePlan(record: PlanRecord | null | undefined, now: Date = new Date()): EffectivePlan {
  const lapsed =
    !record ||
    record.status !== "active" ||
    (record.currentPeriodEnd != null && new Date(record.currentPeriodEnd).getTime() <= now.getTime());

  if (lapsed) {
    const { slug, name, maxSites, dailyToolCalls } = definitionOf(DEFAULT_PLAN);
    return { slug, name, maxSites, dailyToolCalls };
  }

  const { slug, name, maxSites, dailyToolCalls } = definitionOf(record.plan);
  return {
    slug,
    name,
    maxSites: record.maxSitesOverride ?? maxSites,
    dailyToolCalls: record.dailyToolCallsOverride ?? dailyToolCalls,
  };
}

/**
 * A plan limit was reached. The message is written to stand alone: it is shown verbatim to
 * the user and relayed to an AI client, which no longer has any instructions in view.
 */
export class PlanLimitError extends Error {
  constructor(
    readonly limit: "sites" | "toolCalls",
    plan: EffectivePlan
  ) {
    super(
      limit === "sites"
        ? `Your ${plan.name} plan includes ${plan.maxSites} connected ${plan.maxSites === 1 ? "site" : "sites"}, and you've reached that limit. Upgrade your plan in Epexta to connect more.`
        : `Your organisation has used all ${plan.dailyToolCalls.toLocaleString("en-US")} daily tool calls included in the ${plan.name} plan. The allowance resets at 00:00 UTC; upgrade your plan in Epexta for more.`
    );
    this.name = "PlanLimitError";
  }
}
