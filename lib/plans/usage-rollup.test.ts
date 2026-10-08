import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACTIVITY_RETENTION_DAYS, purgeExpiredActivity } from "../activity";
import { getPayloadClient } from "../payload";
import { getUsageHistory, rolledUpThrough, rollUpActivity } from "./usage-rollup";
import { DEFAULT_USAGE_RANGE, parseUsageRange } from "./usage-ranges";

const DAY_MS = 86_400_000;
const daysAgo = (days: number, hour = 12) => {
  const date = new Date(Date.now() - days * DAY_MS);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
};
const dayOf = (date: Date) => date.toISOString().slice(0, 10);

describe("usage rollup", () => {
  const suffix = randomUUID();
  let userId: string;
  let organisationId: string;

  async function addEvent(createdAt: Date, tool: string, outcome: "success" | "failure" = "success", errorCode?: "plan_limit") {
    const payload = await getPayloadClient();
    return payload.create({
      collection: "activity-events",
      data: {
        organisation: Number(organisationId),
        user: Number(userId),
        module: "wordpress",
        tool,
        kind: "read",
        outcome,
        errorCode,
        summary: `${tool} ${suffix}`,
        source: "api-key",
        createdAt: createdAt.toISOString(),
      },
      overrideAccess: true,
    });
  }

  async function rollupRows() {
    const payload = await getPayloadClient();
    const result = await payload.find({
      collection: "usage-rollups",
      where: { organisation: { equals: organisationId } },
      sort: ["day", "tool"],
      limit: 0,
      overrideAccess: true,
    });
    return result.docs.map((doc) => ({ day: doc.day, tool: doc.tool, calls: Number(doc.calls), failures: Number(doc.failures), planLimited: Number(doc.planLimited) }));
  }

  beforeAll(async () => {
    const payload = await getPayloadClient();
    const user = await payload.create({
      collection: "users",
      data: { email: `rollup-${suffix}@example.com`, password: "test-password-123", role: "customer" },
    });
    userId = String(user.id);
    const org = await payload.create({
      collection: "organisations",
      data: { name: `rollup-${suffix}`, members: [{ user: Number(userId), role: "admin" }] },
      overrideAccess: true,
    });
    organisationId = String(org.id);
  });

  afterAll(async () => {
    const payload = await getPayloadClient();
    await payload.delete({ collection: "organisations", id: organisationId, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "users", id: userId, overrideAccess: true }).catch(() => {});
  });

  it("folds finished days per tool, counting failures and plan-limited calls, and skips today", async () => {
    await addEvent(daysAgo(3), "list_posts");
    await addEvent(daysAgo(3), "list_posts");
    await addEvent(daysAgo(3), "list_posts", "failure");
    await addEvent(daysAgo(3), "create_post");
    await addEvent(daysAgo(1), "list_posts", "failure", "plan_limit");
    await addEvent(new Date(), "list_posts");

    await rollUpActivity();

    expect(await rollupRows()).toEqual([
      { day: dayOf(daysAgo(3)), tool: "create_post", calls: 1, failures: 0, planLimited: 0 },
      { day: dayOf(daysAgo(3)), tool: "list_posts", calls: 3, failures: 1, planLimited: 0 },
      { day: dayOf(daysAgo(1)), tool: "list_posts", calls: 1, failures: 1, planLimited: 1 },
    ]);
  });

  it("gives the same result when run again, and picks up a late event for a recent day", async () => {
    const before = await rollupRows();
    await rollUpActivity();
    expect(await rollupRows()).toEqual(before);

    await addEvent(daysAgo(1), "list_posts");
    await rollUpActivity();
    expect((await rollupRows()).find((row) => row.day === dayOf(daysAgo(1)))).toMatchObject({ calls: 2, failures: 1 });
  });

  it("keeps history after the raw events are purged, but never purges what isn't folded in", async () => {
    const payload = await getPayloadClient();
    const expiredAt = new Date(Date.now() - (ACTIVITY_RETENTION_DAYS + 3) * DAY_MS);
    const expired = await addEvent(expiredAt, "old_tool");
    const rolledThrough = (await rolledUpThrough())!;
    expect(rolledThrough).not.toBeNull();

    // A day the rollup hasn't reached yet is never purged, however the retention window falls.
    const unfolded = await addEvent(new Date(rolledThrough.getTime() + 2 * DAY_MS), "future_tool");
    await purgeExpiredActivity();
    expect(await payload.findByID({ collection: "activity-events", id: unfolded.id, overrideAccess: true }).catch(() => null)).not.toBeNull();

    // An expired event is purged once its day is in the rollup, and the history stays.
    await payload.create({
      collection: "usage-rollups",
      data: { organisation: Number(organisationId), day: dayOf(expiredAt), module: "wordpress", tool: "old_tool", kind: "read", calls: 1, failures: 0, planLimited: 0 },
      overrideAccess: true,
    });
    await purgeExpiredActivity();
    expect(await payload.findByID({ collection: "activity-events", id: expired.id, overrideAccess: true }).catch(() => null)).toBeNull();
    expect((await rollupRows()).some((row) => row.tool === "old_tool")).toBe(true);

    await payload.delete({ collection: "activity-events", id: unfolded.id, overrideAccess: true }).catch(() => {});
  });

  it("reports history from the rollup, busiest tool first, with every day in range", async () => {
    const history = await getUsageHistory(organisationId, "30d");
    expect(history.days).toHaveLength(30);
    expect(history.days.at(-1)?.day).toBe(dayOf(daysAgo(1)));
    expect(history.calls).toBe(history.days.reduce((sum, d) => sum + d.calls, 0));
    expect(history.calls).toBe(history.tools.reduce((sum, tool) => sum + tool.calls, 0));
    expect(history.days.find((d) => d.day === dayOf(daysAgo(3)))).toMatchObject({ calls: 4, failures: 1 });
    expect(history.days.find((d) => d.day === dayOf(daysAgo(2)))).toMatchObject({ calls: 0, failures: 0 });
    expect(history.tools[0]).toMatchObject({ tool: "list_posts", calls: 5, failures: 2 });
    expect(history.tools.map((tool) => tool.tool)).not.toContain("old_tool");
  });

  it("narrows to the chosen range, and 'all' starts at the first day with history", async () => {
    const week = await getUsageHistory(organisationId, "7d");
    expect(week.days).toHaveLength(7);
    expect(week.calls).toBe(6);

    const narrow = await getUsageHistory(organisationId, "7d", new Date(daysAgo(0).getTime() + 9 * DAY_MS));
    expect(narrow.calls).toBe(0);

    const all = await getUsageHistory(organisationId, "all");
    expect(all.from).toBe(dayOf(new Date(Date.now() - (ACTIVITY_RETENTION_DAYS + 3) * DAY_MS)));
    expect(all.calls).toBe(7);
    expect(all.days.length).toBeGreaterThan(ACTIVITY_RETENTION_DAYS);
  });

  it("falls back to the default range for anything unrecognised", () => {
    expect(parseUsageRange("7d")).toBe("7d");
    expect(parseUsageRange("all")).toBe("all");
    expect(parseUsageRange("forever")).toBe(DEFAULT_USAGE_RANGE);
    expect(parseUsageRange(undefined)).toBe(DEFAULT_USAGE_RANGE);
  });
});
