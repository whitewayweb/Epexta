import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPayloadClient } from "../../lib/payload";
import { createOrReplaceMapping, getActiveMappingForWordPressConnection } from "./mappings";

describe("google-search-console createOrReplaceMapping", () => {
  let organisationId: string;
  let adminUserId: string;
  let wordpressConnectionId: string;
  let googleConnectionId: string;
  let otherWordpressConnectionId: string;

  beforeAll(async () => {
    const payload = await getPayloadClient();
    const suffix = randomUUID();

    const adminUser = await payload.create({
      collection: "users",
      data: { email: `gsc-admin-${suffix}@example.com`, password: "test-password-123", role: "customer" },
    });
    adminUserId = String(adminUser.id);

    const org = await payload.create({
      collection: "organisations",
      data: { name: `gsc-test-org-${suffix}`, members: [{ user: Number(adminUserId), role: "admin" }] },
      overrideAccess: true,
    });
    organisationId = String(org.id);

    const wpConnection = await payload.create({
      collection: "wordpress-connections",
      data: {
        organisation: Number(organisationId),
        siteUrl: `https://gsc-test-${suffix}.example.com`,
        username: "admin",
        appPassword: "fake app password",
      },
      overrideAccess: true,
    });
    wordpressConnectionId = String(wpConnection.id);

    const otherWpConnection = await payload.create({
      collection: "wordpress-connections",
      data: {
        organisation: Number(organisationId),
        siteUrl: `https://gsc-other-test-${suffix}.example.com`,
        username: "admin",
        appPassword: "fake app password",
      },
      overrideAccess: true,
    });
    otherWordpressConnectionId = String(otherWpConnection.id);

    const googleConnection = await payload.create({
      collection: "google-connections",
      data: {
        organisation: Number(organisationId),
        googleAccountLabel: "Test Google account",
        grantedScopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
        scopeProfile: "google-search-console",
        status: "active",
      },
      overrideAccess: true,
    });
    googleConnectionId = String(googleConnection.id);
  });

  afterAll(async () => {
    const payload = await getPayloadClient();
    await payload
      .delete({ collection: "google-search-console-mappings", where: { organisation: { equals: organisationId } }, overrideAccess: true })
      .catch(() => {});
    await payload.delete({ collection: "google-connections", id: googleConnectionId, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "wordpress-connections", id: wordpressConnectionId, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "wordpress-connections", id: otherWordpressConnectionId, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "organisations", id: organisationId, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "users", id: adminUserId, overrideAccess: true }).catch(() => {});
  });

  it("creates a new active mapping", async () => {
    const { mappingId } = await createOrReplaceMapping(
      organisationId,
      { wordpressConnectionId, googleConnectionId, searchConsolePropertyUrl: "sc-domain:example.com" },
      adminUserId
    );

    const active = await getActiveMappingForWordPressConnection(organisationId, wordpressConnectionId);
    expect(active?.mappingId).toBe(mappingId);
    expect(active?.searchConsolePropertyUrl).toBe("sc-domain:example.com");
  });

  it("supersedes the previous active mapping (not deletes it) when replacing", async () => {
    const first = await createOrReplaceMapping(
      organisationId,
      { wordpressConnectionId: otherWordpressConnectionId, googleConnectionId, searchConsolePropertyUrl: "sc-domain:first.example.com" },
      adminUserId
    );

    const second = await createOrReplaceMapping(
      organisationId,
      { wordpressConnectionId: otherWordpressConnectionId, googleConnectionId, searchConsolePropertyUrl: "sc-domain:second.example.com" },
      adminUserId
    );

    expect(second.mappingId).not.toBe(first.mappingId);

    const payload = await getPayloadClient();
    const oldDoc = await payload.findByID({
      collection: "google-search-console-mappings",
      id: first.mappingId,
      depth: 0,
      overrideAccess: true,
    });
    expect(oldDoc.status).toBe("superseded");
    expect(String(oldDoc.replacedBy)).toBe(second.mappingId);

    const active = await getActiveMappingForWordPressConnection(organisationId, otherWordpressConnectionId);
    expect(active?.mappingId).toBe(second.mappingId);
    expect(active?.searchConsolePropertyUrl).toBe("sc-domain:second.example.com");
  });

  it("never leaves two active mappings for the same WordPress connection, even under concurrent replacement", async () => {
    // Both concurrent calls see "no active mapping yet" (or the same one) inside their
    // own transaction and race to insert an active row - the database's partial unique
    // index (not application logic) is what guarantees only one wins.
    const suffix = randomUUID();
    const payload = await getPayloadClient();
    const raceConnection = await payload.create({
      collection: "wordpress-connections",
      data: {
        organisation: Number(organisationId),
        siteUrl: `https://gsc-race-${suffix}.example.com`,
        username: "admin",
        appPassword: "fake app password",
      },
      overrideAccess: true,
    });

    const attempts = await Promise.allSettled([
      createOrReplaceMapping(
        organisationId,
        { wordpressConnectionId: String(raceConnection.id), googleConnectionId, searchConsolePropertyUrl: "sc-domain:race-a.example.com" },
        adminUserId
      ),
      createOrReplaceMapping(
        organisationId,
        { wordpressConnectionId: String(raceConnection.id), googleConnectionId, searchConsolePropertyUrl: "sc-domain:race-b.example.com" },
        adminUserId
      ),
    ]);

    const succeeded = attempts.filter((a) => a.status === "fulfilled");
    expect(succeeded.length).toBeGreaterThanOrEqual(1);

    const activeRows = await payload.find({
      collection: "google-search-console-mappings",
      where: { wordpressConnection: { equals: raceConnection.id }, status: { equals: "active" } },
      overrideAccess: true,
    });
    expect(activeRows.docs).toHaveLength(1);

    await payload
      .delete({ collection: "google-search-console-mappings", where: { wordpressConnection: { equals: raceConnection.id } }, overrideAccess: true })
      .catch(() => {});
    await payload.delete({ collection: "wordpress-connections", id: raceConnection.id, overrideAccess: true }).catch(() => {});
  });
});
