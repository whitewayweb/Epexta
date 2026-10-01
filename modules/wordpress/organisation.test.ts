import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import { getPayloadClient } from "../../lib/payload";
import { createOrReplaceMapping as createOrReplaceSearchConsoleMapping } from "../google-search-console/mappings";
import { createOrReplaceMapping as createOrReplaceAnalyticsMapping } from "../google-analytics/mappings";
import {
  createWordPressConnection,
  deleteWordPressConnection,
  getOwnedWordPressConnection,
  getWordPressConnection,
  listWordPressConnections,
  WordPressConnectionInUseError,
} from "./organisation";

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
        user: Number(adminUserId),
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

    await expect(deleteWordPressConnection(organisationId, adminUserId, wordpressConnectionId)).rejects.toThrow(
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

    await expect(deleteWordPressConnection(organisationId, adminUserId, wordpressConnectionId)).rejects.toThrow(
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

    await expect(deleteWordPressConnection(organisationId, adminUserId, wordpressConnectionId)).resolves.toBeUndefined();

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
        user: Number(adminUserId),
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

describe("wordpress-connections per-user ownership", () => {
  async function makeTwoAdmins(suffix: string) {
    const payload = await getPayloadClient();
    const makeUser = async (name: string) =>
      payload.create({
        collection: "users",
        data: { email: `wp-owner-${name}-${suffix}@example.com`, password: "test-password-123", role: "customer" },
      });
    const [first, second] = await Promise.all([makeUser("a"), makeUser("b")]);
    const org = await payload.create({
      collection: "organisations",
      data: {
        name: `wp-owner-org-${suffix}`,
        members: [
          { user: Number(first.id), role: "admin" },
          { user: Number(second.id), role: "admin" },
        ],
      },
      overrideAccess: true,
    });
    return { payload, firstId: String(first.id), secondId: String(second.id), organisationId: String(org.id) };
  }

  async function cleanup(fixtures: Awaited<ReturnType<typeof makeTwoAdmins>>) {
    const { payload, firstId, secondId, organisationId } = fixtures;
    await payload.delete({ collection: "organisations", id: organisationId, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "users", id: firstId, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "users", id: secondId, overrideAccess: true }).catch(() => {});
  }

  const credentials = (siteUrl: string, username: string) => ({ siteUrl, username, appPassword: "fake app password" });

  it("lets two users of one organisation connect the same site, each seeing only their own", async () => {
    const fixtures = await makeTwoAdmins(randomUUID());
    const { organisationId, firstId, secondId } = fixtures;
    const siteUrl = `https://wp-owner-${randomUUID()}.example.com`;

    await createWordPressConnection(organisationId, firstId, credentials(siteUrl, "first"));
    await createWordPressConnection(organisationId, secondId, credentials(siteUrl, "second"));

    const firstSees = await listWordPressConnections(organisationId, firstId);
    const secondSees = await listWordPressConnections(organisationId, secondId);
    expect(firstSees.map((c) => c.username)).toEqual(["first"]);
    expect(secondSees.map((c) => c.username)).toEqual(["second"]);

    await cleanup(fixtures);
  });

  it("does not let a user fetch or delete a colleague's connection by id", async () => {
    const fixtures = await makeTwoAdmins(randomUUID());
    const { organisationId, firstId, secondId } = fixtures;
    await createWordPressConnection(organisationId, firstId, credentials(`https://wp-owner-${randomUUID()}.example.com`, "first"));
    const [firstConnection] = await listWordPressConnections(organisationId, firstId);

    expect(await getOwnedWordPressConnection(organisationId, secondId, firstConnection.connectionId)).toBeNull();
    await expect(deleteWordPressConnection(organisationId, secondId, firstConnection.connectionId)).rejects.toThrow(
      "Connection not found."
    );
    expect(await getOwnedWordPressConnection(organisationId, firstId, firstConnection.connectionId)).not.toBeNull();

    await cleanup(fixtures);
  });

  it("rejects the same user connecting the same site twice", async () => {
    const fixtures = await makeTwoAdmins(randomUUID());
    const { organisationId, firstId } = fixtures;
    const siteUrl = `https://wp-owner-${randomUUID()}.example.com`;

    await createWordPressConnection(organisationId, firstId, credentials(siteUrl, "first"));
    await expect(createWordPressConnection(organisationId, firstId, credentials(siteUrl, "other"))).rejects.toBeTruthy();

    await cleanup(fixtures);
  });
});
