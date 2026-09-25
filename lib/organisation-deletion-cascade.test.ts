import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import { getPayloadClient } from "./payload";

// Regression test for a real bug found while smoke-testing the Google Site Hub connect
// flow: Payload's Postgres adapter defaults every relationship FK to ON DELETE SET NULL
// regardless of the field's own `required: true`, so deleting an Organisation crashed
// with a NOT NULL constraint violation the moment any required-relationship child row
// (a WordPress connection, a Google connection, a mapping, an entitlement, a Google OAuth
// state, an OAuth grant/code/token) existed - it never actually cascaded. This exercises the real fix: deleting an
// organisation with a full set of Google Site Hub data attached must succeed and every
// row that should be gone must actually be gone - not just that the delete call itself
// doesn't throw.
describe("deleting an organisation cascades correctly", () => {
  it("removes every dependent row across both platform and Google Site Hub collections", async () => {
    const payload = await getPayloadClient();
    const suffix = randomUUID();

    const orgAdmin = await payload.create({
      collection: "users",
      data: { email: `cascade-admin-${suffix}@example.com`, password: "test-password-123", role: "customer" },
    });
    const orgMember = await payload.create({
      collection: "users",
      data: { email: `cascade-member-${suffix}@example.com`, password: "test-password-123", role: "customer" },
    });

    const org = await payload.create({
      collection: "organisations",
      data: {
        name: `cascade-test-org-${suffix}`,
        members: [
          { user: Number(orgAdmin.id), role: "admin" },
          { user: Number(orgMember.id), role: "member" },
        ],
      },
      overrideAccess: true,
    });
    const organisationId = String(org.id);

    const entitlement = await payload.create({
      collection: "module-entitlements",
      data: { organisation: Number(organisationId), moduleSlug: "google-search-console", enabled: true },
      overrideAccess: true,
    });

    const wordpressConnection = await payload.create({
      collection: "wordpress-connections",
      data: {
        organisation: Number(organisationId),
        siteUrl: `https://cascade-test-${suffix}.example.com`,
        username: "admin",
        appPassword: "fake app password",
      },
      overrideAccess: true,
    });

    const googleConnection = await payload.create({
      collection: "google-connections",
      data: {
        organisation: Number(organisationId),
        googleAccountLabel: "Cascade test account",
        grantedScopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
        scopeProfile: "google-search-console",
        status: "active",
      },
      overrideAccess: true,
    });

    const oauthState = await payload.create({
      collection: "google-oauth-states",
      data: {
        state: `cascade-state-${suffix}`,
        codeVerifier: "fake-verifier",
        user: Number(orgAdmin.id),
        organisation: Number(organisationId),
        capability: "google-search-console",
        flow: { type: "connect" },
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      overrideAccess: true,
    });

    const mapping = await payload.create({
      collection: "google-search-console-mappings",
      data: {
        organisation: Number(organisationId),
        wordpressConnection: Number(wordpressConnection.id),
        googleConnection: Number(googleConnection.id),
        searchConsolePropertyUrl: "sc-domain:cascade-test.example.com",
        confirmedBy: Number(orgAdmin.id),
        confirmedAt: new Date().toISOString(),
        status: "active",
      },
      overrideAccess: true,
    });

    const oauthClient = await payload.create({
      collection: "oauth-clients",
      data: {
        clientId: `epx_client_cascade-${suffix}`,
        registrationType: "dcr",
        clientName: "Cascade test client",
        redirectUris: ["https://client.example.test/callback"],
      },
      overrideAccess: true,
    });
    const oauthCode = await payload.create({
      collection: "oauth-authorization-codes",
      data: {
        hashedCode: `cascade-code-${suffix}`,
        client: oauthClient.id,
        user: Number(orgMember.id),
        organisation: Number(organisationId),
        resource: "https://example.test/api/wordpress/mcp",
        scopes: [],
        redirectUri: "https://client.example.test/callback",
        codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      overrideAccess: true,
    });
    const oauthGrant = await payload.create({
      collection: "oauth-grants",
      data: {
        user: Number(orgMember.id),
        organisation: Number(organisationId),
        client: oauthClient.id,
        resource: "https://example.test/api/wordpress/mcp",
        scopes: [],
      },
      overrideAccess: true,
    });
    const oauthToken = await payload.create({
      collection: "oauth-tokens",
      data: {
        hashedToken: `cascade-token-${suffix}`,
        grant: oauthGrant.id,
        tokenType: "access",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      overrideAccess: true,
    });

    // The delete itself must succeed, not throw.
    await payload.delete({ collection: "organisations", id: organisationId, overrideAccess: true });

    // And every dependent row must actually be gone - not just that the call above
    // didn't error, since a partial/no-op cascade would still let this delete "succeed"
    // while silently leaving orphaned data behind.
    await expect(
      payload.findByID({ collection: "module-entitlements", id: entitlement.id, overrideAccess: true })
    ).rejects.toBeTruthy();
    await expect(
      payload.findByID({ collection: "wordpress-connections", id: wordpressConnection.id, overrideAccess: true })
    ).rejects.toBeTruthy();
    await expect(
      payload.findByID({ collection: "google-connections", id: googleConnection.id, overrideAccess: true })
    ).rejects.toBeTruthy();
    await expect(
      payload.findByID({ collection: "google-oauth-states", id: oauthState.id, overrideAccess: true })
    ).rejects.toBeTruthy();
    await expect(
      payload.findByID({ collection: "google-search-console-mappings", id: mapping.id, overrideAccess: true })
    ).rejects.toBeTruthy();

    // A departed organisation's connected apps and their tokens go with it; the OAuth
    // client record itself is shared across organisations and survives.
    for (const [collection, id] of [
      ["oauth-authorization-codes", oauthCode.id],
      ["oauth-grants", oauthGrant.id],
      ["oauth-tokens", oauthToken.id],
    ] as const) {
      await expect(payload.findByID({ collection, id, overrideAccess: true })).rejects.toBeTruthy();
    }
    await payload.delete({ collection: "oauth-clients", id: oauthClient.id, overrideAccess: true });

    // Users themselves are not deleted by an organisation deletion - only their
    // membership in it goes away, via organisations_members' own cascade.
    const survivingAdmin = await payload.findByID({ collection: "users", id: orgAdmin.id, overrideAccess: true });
    expect(survivingAdmin.email).toBe(`cascade-admin-${suffix}@example.com`);

    await payload.delete({ collection: "users", id: orgAdmin.id, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "users", id: orgMember.id, overrideAccess: true }).catch(() => {});
  });

  it("deleting a user survives their mapping row, only unsetting confirmedBy", async () => {
    const payload = await getPayloadClient();
    const suffix = randomUUID();

    const confirmingUser = await payload.create({
      collection: "users",
      data: { email: `cascade-confirmer-${suffix}@example.com`, password: "test-password-123", role: "customer" },
    });
    const orgAdmin = await payload.create({
      collection: "users",
      data: { email: `cascade-admin2-${suffix}@example.com`, password: "test-password-123", role: "customer" },
    });

    const org = await payload.create({
      collection: "organisations",
      data: { name: `cascade-test-org2-${suffix}`, members: [{ user: Number(orgAdmin.id), role: "admin" }] },
      overrideAccess: true,
    });

    const wordpressConnection = await payload.create({
      collection: "wordpress-connections",
      data: {
        organisation: Number(org.id),
        siteUrl: `https://cascade-test2-${suffix}.example.com`,
        username: "admin",
        appPassword: "fake app password",
      },
      overrideAccess: true,
    });

    const googleConnection = await payload.create({
      collection: "google-connections",
      data: {
        organisation: Number(org.id),
        googleAccountLabel: "Cascade test account 2",
        grantedScopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
        scopeProfile: "google-search-console",
        status: "active",
      },
      overrideAccess: true,
    });

    const mapping = await payload.create({
      collection: "google-search-console-mappings",
      data: {
        organisation: Number(org.id),
        wordpressConnection: Number(wordpressConnection.id),
        googleConnection: Number(googleConnection.id),
        searchConsolePropertyUrl: "sc-domain:cascade-test2.example.com",
        confirmedBy: Number(confirmingUser.id),
        confirmedAt: new Date().toISOString(),
        status: "active",
      },
      overrideAccess: true,
    });

    await payload.delete({ collection: "users", id: confirmingUser.id, overrideAccess: true });

    const survivingMapping = await payload.findByID({
      collection: "google-search-console-mappings",
      id: mapping.id,
      depth: 0,
      overrideAccess: true,
    });
    expect(survivingMapping.status).toBe("active");
    expect(survivingMapping.confirmedBy).toBeFalsy();

    await payload.delete({ collection: "organisations", id: org.id, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "users", id: orgAdmin.id, overrideAccess: true }).catch(() => {});
  });
});
