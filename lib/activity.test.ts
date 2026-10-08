import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rollUpActivity } from "./usage-rollup";
import { ACTIVITY_RETENTION_DAYS, countActivity, listActivity, purgeExpiredActivity, recordActivity } from "./activity";
import { getPayloadClient } from "./payload";

describe("activity log", () => {
  const suffix = randomUUID();
  let adminId: string;
  let memberId: string;
  let organisationId: string;
  let otherOrganisationId: string;
  const userIds: string[] = [];
  const organisationIds: string[] = [];

  const base = () => ({
    module: "wordpress" as const,
    tool: "create_post",
    kind: "create" as const,
    outcome: "success" as const,
    summary: "Create Blog Post",
    source: "api-key" as const,
  });

  beforeAll(async () => {
    const payload = await getPayloadClient();
    const makeUser = async (label: string, name: string) => {
      const user = await payload.create({
        collection: "users",
        data: { email: `activity-${label}-${suffix}@example.com`, password: "test-password-123", role: "customer", name },
      });
      userIds.push(String(user.id));
      return String(user.id);
    };
    adminId = await makeUser("admin", "Ada Admin");
    memberId = await makeUser("member", "Mo Member");

    const org = await payload.create({
      collection: "organisations",
      data: {
        name: `activity-org-${suffix}`,
        members: [
          { user: Number(adminId), role: "admin" },
          { user: Number(memberId), role: "member" },
        ],
      },
      overrideAccess: true,
    });
    organisationId = String(org.id);
    const other = await payload.create({
      collection: "organisations",
      data: { name: `activity-other-${suffix}`, members: [{ user: Number(adminId), role: "admin" }] },
      overrideAccess: true,
    });
    otherOrganisationId = String(other.id);
    organisationIds.push(organisationId, otherOrganisationId);
  });

  afterAll(async () => {
    const payload = await getPayloadClient();
    for (const id of organisationIds) {
      await payload.delete({ collection: "organisations", id, overrideAccess: true }).catch(() => {});
    }
    for (const id of userIds) {
      await payload.delete({ collection: "users", id, overrideAccess: true }).catch(() => {});
    }
  });

  it("stores who did what, with the actor's name", async () => {
    await recordActivity({ ...base(), organisationId, userId: adminId, summary: "Create Blog Post: \"Hello\"", siteLabel: "a.example.com" });

    const [item] = await listActivity(organisationId, { userId: adminId, role: "admin" }, { limit: 1 });
    expect(item).toMatchObject({
      module: "wordpress",
      tool: "create_post",
      kind: "create",
      outcome: "success",
      summary: 'Create Blog Post: "Hello"',
      siteLabel: "a.example.com",
      actorLabel: "Ada Admin",
      source: "api-key",
      client: null,
    });
  });

  it("shows admins everything and members only their own events, never another organisation's", async () => {
    await recordActivity({ ...base(), organisationId, userId: memberId, summary: "member event" });
    await recordActivity({ ...base(), organisationId: otherOrganisationId, userId: adminId, summary: "other org event" });

    const admin = await listActivity(organisationId, { userId: adminId, role: "admin" }, { limit: 50 });
    const member = await listActivity(organisationId, { userId: memberId, role: "member" }, { limit: 50 });

    expect(admin.map((e) => e.summary)).toContain("member event");
    expect(admin.map((e) => e.summary)).not.toContain("other org event");
    expect(member.map((e) => e.summary)).toEqual(["member event"]);
    expect(await countActivity(organisationId, { userId: memberId, role: "member" }, { sinceDays: 7 })).toBe(1);
  });

  it("filters out successful reads for the feed but still counts them", async () => {
    await recordActivity({ ...base(), organisationId, userId: adminId, tool: "list_posts", kind: "read", summary: "read ok" });
    await recordActivity({ ...base(), organisationId, userId: adminId, tool: "list_posts", kind: "read", outcome: "failure", errorCode: "tool_error", summary: "read failed" });
    const viewer = { userId: adminId, role: "admin" as const };

    const feed = (await listActivity(organisationId, viewer, { limit: 50, hideSuccessfulReads: true })).map((e) => e.summary);
    expect(feed).not.toContain("read ok");
    expect(feed).toContain("read failed");
    expect(await countActivity(organisationId, viewer, { sinceDays: 7, kinds: ["read"] })).toBe(2);
    expect(await countActivity(organisationId, viewer, { sinceDays: 7, outcome: "failure" })).toBe(1);
  });

  it("pages newest-first with a cursor", async () => {
    const viewer = { userId: adminId, role: "admin" as const };
    const first = await listActivity(organisationId, viewer, { limit: 2 });
    const second = await listActivity(organisationId, viewer, { limit: 2, before: first[1] });

    expect(first).toHaveLength(2);
    const ids = new Set([...first, ...second].map((e) => e.id));
    expect(ids.size).toBe(first.length + second.length);
    expect(second[0].createdAt <= first[1].createdAt).toBe(true);
  });

  it("truncates over-long text", async () => {
    await recordActivity({ ...base(), organisationId, userId: adminId, summary: "x".repeat(500) });
    const [item] = await listActivity(organisationId, { userId: adminId, role: "admin" }, { limit: 1 });
    expect(item.summary).toHaveLength(200);
  });

  it("keeps the event and actor name when the user is deleted", async () => {
    const payload = await getPayloadClient();
    const user = await payload.create({
      collection: "users",
      data: { email: `activity-gone-${suffix}@example.com`, password: "test-password-123", role: "customer", name: "Gone Person" },
    });
    await recordActivity({ ...base(), organisationId, userId: String(user.id), summary: "from deleted user" });
    await payload.delete({ collection: "users", id: user.id, overrideAccess: true });

    const events = await listActivity(organisationId, { userId: adminId, role: "admin" }, { limit: 50 });
    expect(events.find((e) => e.summary === "from deleted user")?.actorLabel).toBe("Gone Person");
  });

  it("cascades with its organisation", async () => {
    const payload = await getPayloadClient();
    const org = await payload.create({
      collection: "organisations",
      data: { name: `activity-cascade-${suffix}`, members: [{ user: Number(adminId), role: "admin" }] },
      overrideAccess: true,
    });
    await recordActivity({ ...base(), organisationId: String(org.id), userId: adminId });
    await payload.delete({ collection: "organisations", id: org.id, overrideAccess: true });

    const { totalDocs } = await payload.count({
      collection: "activity-events",
      where: { organisation: { equals: org.id } },
      overrideAccess: true,
    });
    expect(totalDocs).toBe(0);
  });

  it("purges only events past the retention window", async () => {
    const payload = await getPayloadClient();
    const old = await payload.create({
      collection: "activity-events",
      data: {
        organisation: Number(organisationId),
        user: Number(adminId),
        module: "wordpress",
        tool: "create_post",
        kind: "create",
        outcome: "success",
        summary: "ancient",
        source: "api-key",
        createdAt: new Date(Date.now() - (ACTIVITY_RETENTION_DAYS + 1) * 86_400_000).toISOString(),
      },
      overrideAccess: true,
    });
    await recordActivity({ ...base(), organisationId, userId: adminId, summary: "fresh" });

    // The purge only deletes what the usage rollup has already folded in.
    await rollUpActivity();
    expect(await purgeExpiredActivity()).toBeGreaterThanOrEqual(1);

    const gone = await payload.findByID({ collection: "activity-events", id: old.id, overrideAccess: true }).catch(() => null);
    expect(gone).toBeNull();
    const events = await listActivity(organisationId, { userId: adminId, role: "admin" }, { limit: 50 });
    expect(events.map((e) => e.summary)).toContain("fresh");
  });
});
