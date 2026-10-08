import { describe, expect, it } from "vitest";
import { PLANS, PlanLimitError, resolvePlan } from "./plans";

const now = new Date("2026-10-08T12:00:00Z");

describe("resolvePlan", () => {
  it("puts an organisation with no record on Free", () => {
    expect(resolvePlan(null, now)).toEqual({ slug: "free", name: "Free", maxSites: 1, dailyToolCalls: 100 });
  });

  it("gives each plan its own limits", () => {
    expect(resolvePlan({ plan: "pro", status: "active" }, now)).toMatchObject({ slug: "pro", maxSites: 5, dailyToolCalls: 500 });
    expect(resolvePlan({ plan: "agency", status: "active" }, now)).toMatchObject({ slug: "agency", maxSites: 25, dailyToolCalls: 5000 });
  });

  it("keeps limits strictly increasing from Free to Agency", () => {
    for (let i = 1; i < PLANS.length; i++) {
      expect(PLANS[i].maxSites).toBeGreaterThan(PLANS[i - 1].maxSites);
      expect(PLANS[i].dailyToolCalls).toBeGreaterThan(PLANS[i - 1].dailyToolCalls);
    }
  });

  it("falls back to Free when suspended", () => {
    expect(resolvePlan({ plan: "agency", status: "suspended" }, now).slug).toBe("free");
  });

  it("falls back to Free once the paid period has ended, and not before", () => {
    expect(resolvePlan({ plan: "pro", status: "active", currentPeriodEnd: "2026-10-08T11:59:59Z" }, now).slug).toBe("free");
    expect(resolvePlan({ plan: "pro", status: "active", currentPeriodEnd: "2026-10-08T12:00:00Z" }, now).slug).toBe("free");
    expect(resolvePlan({ plan: "pro", status: "active", currentPeriodEnd: "2026-10-09T00:00:00Z" }, now).slug).toBe("pro");
    expect(resolvePlan({ plan: "pro", status: "active", currentPeriodEnd: null }, now).slug).toBe("pro");
  });

  it("applies overrides on top of the plan, but not to a lapsed one", () => {
    const record = { plan: "agency" as const, status: "active" as const, maxSitesOverride: 50, dailyToolCallsOverride: 9000 };
    expect(resolvePlan(record, now)).toMatchObject({ slug: "agency", maxSites: 50, dailyToolCalls: 9000 });
    expect(resolvePlan({ ...record, status: "suspended" }, now)).toMatchObject({ slug: "free", maxSites: 1 });
  });
});

describe("PlanLimitError", () => {
  it("explains a site limit on its own", () => {
    const message = new PlanLimitError("sites", resolvePlan(null, now)).message;
    expect(message).toContain("Free plan includes 1 connected site");
    expect(message).toContain("Upgrade");
  });

  it("explains a daily tool call limit on its own", () => {
    const message = new PlanLimitError("toolCalls", resolvePlan({ plan: "agency", status: "active" }, now)).message;
    expect(message).toContain("5,000 daily tool calls");
    expect(message).toContain("00:00 UTC");
  });
});
