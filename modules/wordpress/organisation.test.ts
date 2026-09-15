import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import { getPayloadClient } from "../../lib/payload";
import { createOrReplaceMapping as createOrReplaceSearchConsoleMapping } from "../google-search-console/mappings";
import { createOrReplaceMapping as createOrReplaceAnalyticsMapping } from "../google-analytics/mappings";
import { deleteWordPressConnection, getWordPressConnection, WordPressConnectionInUseError } from "./organisation";

// Regression test for a gap found alongside the organisation-deletion cascade bug (see
// lib/organisation-deletion-cascade.test.ts): the cascade-delete migration made
// *-mappings.wordpressConnection ON DELETE CASCADE, which means deleting a WordPress
// connection directly (not via organisation deletion) would silently wipe any Google
// Search Console/Analytics mapping history pointing at it, with no warning. This
// exercises the guard added to deleteWordPressConnection that blocks that instead.
describe("deleteWordPressConnection blocks deletion when Google mappings reference it", () => {
  async function makeFixtures(suffix: string) {
    const payload = await getPayloadClient();
    const adminUser = await payload.create({
      collection: "users",
      data: { email: `wp-delete-admin-${suffix}@example.com`, password: "test-password-123", role: "customer" },
    });
    const adminUserId = String(adminUser.id);

    const org = await payload.create({
      collection: "organisations",
      data: { name: `wp-delete-org-${suffix}`, members: [{ user: Number(adminUserId), role: "admin" }] },
      overrideAccess: true,
    });
    const organisationId = String(org.id);

    const wpConnection = await payload.create({
      collection: "wordpress-connections",
      data: {
        organisation: Number(organisationId),
        siteUrl: `https://wp-delete-${suffix}.example.com`,
        username: "admin",
        appPassword: "fake app password",
      },
      overrideAccess: true,
    });
    const wordpressConnectionId = String(wpConnection.id);

    return { payload, adminUserId, organisationId, wordpressConnectionId };
  }

  it("blocks deletion when a google-search-console mapping still points at the connection", async () => {
    const suffix = randomUUID();
    const { payload, adminUserId, organisationId, wordpressConnectionId } = await makeFixtures(suffix);

    const googleConnection = await payload.create({
      collection: "google-connections",
      data: {
        organisation: Number(organisationId),
        googleAccountLabel: "Test account",
        grantedScopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
        scopeProfile: "google-search-console",
        status: "active",
      },
      overrideAccess: true,
    });

    await createOrReplaceSearchConsoleMapping(
      organisationId,
      { wordpressConnectionId, googleConnectionId: String(googleConnection.id), searchConsolePropertyUrl: "sc-domain:wp-delete.example.com" },
      adminUserId
    );

    await expect(deleteWordPressConnection(organisationId, wordpressConnectionId)).rejects.toThrow(
      WordPressConnectionInUseError
    );

    const survivingConnection = await payload.findByID({
      collection: "wordpress-connections",
      id: wordpressConnectionId,
      overrideAccess: true,
    });
    expect(survivingConnection.id).toBeTruthy();

    await payload
      .delete({ collection: "google-search-console-mappings", where: { organisation: { equals: organisationId } }, overrideAccess: true })
      .catch(() => {});
    await payload.delete({ collection: "organisations", id: organisationId, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "users", id: adminUserId, overrideAccess: true }).catch(() => {});
  });

  it("blocks deletion when a google-analytics mapping still points at the connection", async () => {
    const suffix = randomUUID();
    const { payload, adminUserId, organisationId, wordpressConnectionId } = await makeFixtures(suffix);

    const googleConnection = await payload.create({
      collection: "google-connections",
      data: {
        organisation: Number(organisationId),
        googleAccountLabel: "Test account",
        grantedScopes: ["https://www.googleapis.com/auth/analytics.readonly"],
        scopeProfile: "google-analytics",
        status: "active",
      },
      overrideAccess: true,
    });

    await createOrReplaceAnalyticsMapping(
      organisationId,
      { wordpressConnectionId, googleConnectionId: String(googleConnection.id), ga4PropertyId: "properties/999" },
      adminUserId
    );

    await expect(deleteWordPressConnection(organisationId, wordpressConnectionId)).rejects.toThrow(
      WordPressConnectionInUseError
    );

    await payload
      .delete({ collection: "google-analytics-mappings", where: { organisation: { equals: organisationId } }, overrideAccess: true })
      .catch(() => {});
    await payload.delete({ collection: "organisations", id: organisationId, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "users", id: adminUserId, overrideAccess: true }).catch(() => {});
  });

  it("allows deletion when no Google mapping references the connection", async () => {
    const suffix = randomUUID();
    const { payload, adminUserId, organisationId, wordpressConnectionId } = await makeFixtures(suffix);

    await expect(deleteWordPressConnection(organisationId, wordpressConnectionId)).resolves.toBeUndefined();

    await expect(
      payload.findByID({ collection: "wordpress-connections", id: wordpressConnectionId, overrideAccess: true })
    ).rejects.toBeTruthy();

    await payload.delete({ collection: "organisations", id: organisationId, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "users", id: adminUserId, overrideAccess: true }).catch(() => {});
  });
});

// New connections have never been probed for an SEO provider - the collection default
// (seoProviderPreference: "auto") must never be conflated with a confirmed detection.
describe("wordpress-connections SEO provider fields", () => {
  async function makeFixtures(suffix: string) {
    const payload = await getPayloadClient();
    const adminUser = await payload.create({
      collection: "users",
      data: { email: `wp-seo-admin-${suffix}@example.com`, password: "test-password-123", role: "customer" },
    });
    const adminUserId = String(adminUser.id);

    const org = await payload.create({
      collection: "organisations",
      data: { name: `wp-seo-org-${suffix}`, members: [{ user: Number(adminUserId), role: "admin" }] },
      overrideAccess: true,
    });
    const organisationId = String(org.id);

    const otherOrg = await payload.create({
      collection: "organisations",
      data: { name: `wp-seo-other-org-${suffix}`, members: [] },
      overrideAccess: true,
    });
    const otherOrganisationId = String(otherOrg.id);

    const wpConnection = await payload.create({
      collection: "wordpress-connections",
      data: {
        organisation: Number(organisationId),
        siteUrl: `https://wp-seo-${suffix}.example.com`,
        username: "admin",
        appPassword: "fake app password",
      },
      overrideAccess: true,
    });
    const connectionId = String(wpConnection.id);

    return { payload, adminUserId, organisationId, otherOrganisationId, connectionId };
  }

  it("defaults a new connection to auto preference and no asserted profile state", async () => {
    const suffix = randomUUID();
    const { payload, adminUserId, organisationId, otherOrganisationId, connectionId } = await makeFixtures(suffix);

    const connection = await getWordPressConnection(organisationId, connectionId);
    expect(connection?.seoProviderPreference).toBe("auto");
    expect(connection?.seoProfileState).toBeNull();
    expect(connection?.seoProviderObserved).toBeNull();

    await payload.delete({ collection: "organisations", id: organisationId, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "organisations", id: otherOrganisationId, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "users", id: adminUserId, overrideAccess: true }).catch(() => {});
  });

  it("does not let one organisation read another organisation's connection SEO fields", async () => {
    const suffix = randomUUID();
    const { payload, adminUserId, organisationId, otherOrganisationId, connectionId } = await makeFixtures(suffix);

    const crossOrgLookup = await getWordPressConnection(otherOrganisationId, connectionId);
    expect(crossOrgLookup).toBeNull();

    await payload.delete({ collection: "organisations", id: organisationId, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "organisations", id: otherOrganisationId, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "users", id: adminUserId, overrideAccess: true }).catch(() => {});
  });
});
