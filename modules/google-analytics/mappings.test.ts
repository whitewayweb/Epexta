import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPayloadClient } from "../../lib/payload";
import { createOrReplaceMapping, getActiveMappingForWordPressConnection } from "./mappings";

describe("google-analytics createOrReplaceMapping", () => {
  let organisationId: string;
  let adminUserId: string;
  let wordpressConnectionId: string;
  let googleConnectionId: string;

  beforeAll(async () => {
    const payload = await getPayloadClient();
    const suffix = randomUUID();

    const adminUser = await payload.create({
      collection: "users",
      data: { email: `ga-admin-${suffix}@example.com`, password: "test-password-123", role: "customer" },
    });
    adminUserId = String(adminUser.id);

    const org = await payload.create({
      collection: "organisations",
      data: { name: `ga-test-org-${suffix}`, members: [{ user: Number(adminUserId), role: "admin" }] },
      overrideAccess: true,
    });
    organisationId = String(org.id);

    const wpConnection = await payload.create({
      collection: "wordpress-connections",
      data: {
        organisation: Number(organisationId),
        siteUrl: `https://ga-test-${suffix}.example.com`,
        username: "admin",
        appPassword: "fake app password",
      },
      overrideAccess: true,
    });
    wordpressConnectionId = String(wpConnection.id);

    const googleConnection = await payload.create({
      collection: "google-connections",
      data: {
        organisation: Number(organisationId),
        googleAccountLabel: "Test Google account",
        grantedScopes: ["https://www.googleapis.com/auth/analytics.readonly"],
        scopeProfile: "google-analytics",
        status: "active",
      },
      overrideAccess: true,
    });
    googleConnectionId = String(googleConnection.id);
  });

  afterAll(async () => {
    const payload = await getPayloadClient();
    await payload
      .delete({ collection: "google-analytics-mappings", where: { organisation: { equals: organisationId } }, overrideAccess: true })
      .catch(() => {});
    await payload.delete({ collection: "google-connections", id: googleConnectionId, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "wordpress-connections", id: wordpressConnectionId, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "organisations", id: organisationId, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "users", id: adminUserId, overrideAccess: true }).catch(() => {});
  });

  it("rejects mapping to a Google connection that isn't scoped for google-analytics", async () => {
    const payload = await getPayloadClient();
    const wrongScopeConnection = await payload.create({
      collection: "google-connections",
      data: {
        organisation: Number(organisationId),
        googleAccountLabel: "Wrong scope",
        grantedScopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
        scopeProfile: "google-search-console",
        status: "active",
      },
      overrideAccess: true,
    });

    await expect(
      createOrReplaceMapping(
        organisationId,
        { wordpressConnectionId, googleConnectionId: String(wrongScopeConnection.id), ga4PropertyId: "properties/123" },
        adminUserId
      )
    ).rejects.toThrow();

    await payload.delete({ collection: "google-connections", id: wrongScopeConnection.id, overrideAccess: true }).catch(() => {});
  });

  it("creates an active mapping and records the reporting timezone", async () => {
    const { mappingId } = await createOrReplaceMapping(
      organisationId,
      { wordpressConnectionId, googleConnectionId, ga4PropertyId: "properties/123456789", reportingTimezone: "Europe/London" },
      adminUserId
    );

    const active = await getActiveMappingForWordPressConnection(organisationId, wordpressConnectionId);
    expect(active?.mappingId).toBe(mappingId);
    expect(active?.ga4PropertyId).toBe("properties/123456789");
    expect(active?.reportingTimezone).toBe("Europe/London");
  });
});
