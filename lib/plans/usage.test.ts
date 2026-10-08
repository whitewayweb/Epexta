import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getOrganisationPlan } from "./organisation-plan";
import { getPayloadClient } from "../payload";
import { consumeToolCall, getToolCallsToday, purgeExpiredUsage, usageDay, USAGE_RETENTION_DAYS } from "./usage";

describe("tool call meter", () => {
  const suffix = randomUUID();
  let organisationId: string;
  let otherOrganisationId: string;

  let userId: string;

  beforeAll(async () => {
    const payload = await getPayloadClient();
    const user = await payload.create({
      collection: "users",
      data: { email: `usage-${suffix}@example.com`, password: "test-password-123", role: "customer" },
    });
    userId = String(user.id);
    const create = async (name: string) =>
      String(
        (
          await payload.create({
            collection: "organisations",
            data: { name: `${name}-${suffix}`, members: [{ user: Number(userId), role: "admin" }] },
            overrideAccess: true,
          })
        ).id
      );
    organisationId = await create("usage");
    otherOrganisationId = await create("usage-other");
  });

  afterAll(async () => {
    const payload = await getPayloadClient();
    for (const id of [organisationId, otherOrganisationId]) {
      await payload.delete({ collection: "organisations", id, overrideAccess: true }).catch(() => {});
    }
    await payload.delete({ collection: "users", id: userId, overrideAccess: true }).catch(() => {});
  });

  it("counts calls up to the limit and refuses the rest without counting them", async () => {
    expect(await getToolCallsToday(organisationId)).toBe(0);
    expect((await consumeToolCall(organisationId, 3)).allowed).toBe(true);
    expect((await consumeToolCall(organisationId, 3)).allowed).toBe(true);
    expect((await consumeToolCall(organisationId, 3)).allowed).toBe(true);
    expect((await consumeToolCall(organisationId, 3)).allowed).toBe(false);
    expect((await consumeToolCall(organisationId, 3)).allowed).toBe(false);
    expect(await getToolCallsToday(organisationId)).toBe(3);
  });

  it("never lets concurrent calls overshoot the limit", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => consumeToolCall(otherOrganisationId, 5)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    expect(await getToolCallsToday(otherOrganisationId)).toBe(5);
  });

  it("counts each UTC day separately, and a raised limit lets calls through again", async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(usageDay(tomorrow)).not.toBe(usageDay());
    expect((await consumeToolCall(organisationId, 3, tomorrow)).allowed).toBe(true);
    expect(await getToolCallsToday(organisationId, tomorrow)).toBe(1);

    expect((await consumeToolCall(organisationId, 4)).allowed).toBe(true);
    expect(await getToolCallsToday(organisationId)).toBe(4);
  });

  it("allows nothing when the limit is zero", async () => {
    expect((await consumeToolCall(organisationId, 0)).allowed).toBe(false);
  });

  it("purges only days past the retention window", async () => {
    const payload = await getPayloadClient();
    const old = usageDay(new Date(Date.now() - (USAGE_RETENTION_DAYS + 5) * 24 * 60 * 60 * 1000));
    await payload.create({
      collection: "usage-daily",
      data: { organisation: Number(organisationId), day: old, toolCalls: 7 },
      overrideAccess: true,
    });

    expect(await purgeExpiredUsage()).toBeGreaterThanOrEqual(1);
    const remaining = await payload.find({
      collection: "usage-daily",
      where: { organisation: { equals: organisationId } },
      overrideAccess: true,
    });
    expect(remaining.docs.some((doc) => doc.day === old)).toBe(false);
    expect(remaining.docs.some((doc) => doc.day === usageDay())).toBe(true);
  });
});

describe("getOrganisationPlan", () => {
  const suffix = randomUUID();
  let userId: string;
  let organisationId: string;

  beforeAll(async () => {
    const payload = await getPayloadClient();
    const user = await payload.create({
      collection: "users",
      data: { email: `plan-${suffix}@example.com`, password: "test-password-123", role: "customer" },
    });
    userId = String(user.id);
    const org = await payload.create({
      collection: "organisations",
      data: { name: `plan-${suffix}`, members: [{ user: Number(userId), role: "admin" }] },
      overrideAccess: true,
    });
    organisationId = String(org.id);
  });

  afterAll(async () => {
    const payload = await getPayloadClient();
    await payload.delete({ collection: "organisations", id: organisationId, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "users", id: userId, overrideAccess: true }).catch(() => {});
  });

  it("is Free without a record, then follows the stored plan, status and overrides", async () => {
    const payload = await getPayloadClient();
    expect((await getOrganisationPlan(organisationId)).slug).toBe("free");

    const record = await payload.create({
      collection: "organisation-plans",
      data: { organisation: Number(organisationId), plan: "agency", status: "active", maxSitesOverride: 50 },
      overrideAccess: true,
    });
    expect(await getOrganisationPlan(organisationId)).toMatchObject({ slug: "agency", maxSites: 50, dailyToolCalls: 5000 });

    await payload.update({ collection: "organisation-plans", id: record.id, data: { status: "suspended" }, overrideAccess: true });
    expect((await getOrganisationPlan(organisationId)).slug).toBe("free");
  });

  it("allows only one plan record per organisation", async () => {
    const payload = await getPayloadClient();
    await expect(
      payload.create({
        collection: "organisation-plans",
        data: { organisation: Number(organisationId), plan: "pro", status: "active" },
        overrideAccess: true,
      })
    ).rejects.toThrow();
  });
});
