import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getPayloadClient } from "../../lib/payload";
import * as oauth from "./oauth";
import { registerConnectionLifecycleHooks } from "./registry";

vi.mock("./oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./oauth")>();
  return {
    ...actual,
    exchangeCodeForTokens: vi.fn(),
    refreshAccessToken: vi.fn(),
  };
});

// Imported after the mock so every call inside index.ts resolves to the mocked module -
// these tests never talk to Google's real token endpoint.
const {
  startAuthorization,
  handleCallback,
  getConnectionForCapability,
  listConnectionsForCapability,
  executeGoogleApiRequest,
  revokeConnection,
  disconnectOrDelete,
} = await import("./index");

const exchangeCodeForTokens = vi.mocked(oauth.exchangeCodeForTokens);

describe("modules/google-connections", () => {
  let adminUserId: string;
  let memberUserId: string;
  let otherOrgAdminUserId: string;
  let organisationId: string;
  let otherOrganisationId: string;

  beforeAll(async () => {
    const payload = await getPayloadClient();
    const suffix = randomUUID();

    const adminUser = await payload.create({
      collection: "users",
      data: { email: `gc-admin-${suffix}@example.com`, password: "test-password-123", role: "customer" },
    });
    adminUserId = String(adminUser.id);

    const memberUser = await payload.create({
      collection: "users",
      data: { email: `gc-member-${suffix}@example.com`, password: "test-password-123", role: "customer" },
    });
    memberUserId = String(memberUser.id);

    const otherOrgAdminUser = await payload.create({
      collection: "users",
      data: { email: `gc-other-admin-${suffix}@example.com`, password: "test-password-123", role: "customer" },
    });
    otherOrgAdminUserId = String(otherOrgAdminUser.id);

    const org = await payload.create({
      collection: "organisations",
      data: {
        name: `gc-test-org-${suffix}`,
        members: [
          { user: Number(adminUserId), role: "admin" },
          { user: Number(memberUserId), role: "member" },
        ],
      },
      overrideAccess: true,
    });
    organisationId = String(org.id);

    // Single-org-per-user is an existing platform assumption (lib/organisation.ts) -
    // adminUserId must not also belong to otherOrganisationId, or getUserOrganisation's
    // own lookup becomes ambiguous. A separate admin user models the cross-organisation
    // case cleanly instead.
    const otherOrg = await payload.create({
      collection: "organisations",
      data: { name: `gc-other-org-${suffix}`, members: [{ user: Number(otherOrgAdminUserId), role: "admin" }] },
      overrideAccess: true,
    });
    otherOrganisationId = String(otherOrg.id);
  });

  afterAll(async () => {
    const payload = await getPayloadClient();
    await payload.delete({ collection: "organisations", id: organisationId, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "organisations", id: otherOrganisationId, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "users", id: adminUserId, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "users", id: memberUserId, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "users", id: otherOrgAdminUserId, overrideAccess: true }).catch(() => {});
  });

  it("is unreachable through Payload's own REST/GraphQL/admin-panel access rules for every role, including an organisation admin", async () => {
    const payload = await getPayloadClient();
    const adminDoc = await payload.findByID({ collection: "users", id: adminUserId, overrideAccess: true });

    // access.read returning false outright (not a query constraint) makes Payload
    // reject the whole operation rather than silently return zero rows - the
    // stronger of the two possible confirmations that this is unreachable.
    const readAttempt = payload.find({ collection: "google-connections", overrideAccess: false, user: adminDoc });
    await expect(readAttempt).rejects.toBeTruthy();

    const createAttempt = payload.create({
      collection: "google-connections",
      data: {
        organisation: Number(organisationId),
        googleAccountLabel: "should not be creatable directly",
        grantedScopes: [] as string[],
        scopeProfile: "google-search-console" as const,
        status: "active" as const,
      },
      overrideAccess: false,
    });
    await expect(createAttempt).rejects.toBeTruthy();
  });

  it("rejects startAuthorization from a non-admin member and from an admin of a different organisation", async () => {
    await expect(startAuthorization(memberUserId, organisationId, "google-search-console", { type: "connect" })).rejects.toThrow();
    // otherOrgAdminUserId is a real organisation admin - just not of organisationId.
    await expect(
      startAuthorization(otherOrgAdminUserId, organisationId, "google-search-console", { type: "connect" })
    ).rejects.toThrow();
    await expect(
      startAuthorization(adminUserId, organisationId, "google-search-console", { type: "connect" })
    ).resolves.toBeTruthy();
  });

  it("issues a single-use state bound to user/organisation/capability/flow, and rejects a replayed state", async () => {
    const { stateToken } = await startAuthorization(adminUserId, organisationId, "google-search-console", { type: "connect" });

    exchangeCodeForTokens.mockResolvedValueOnce({
      ok: true,
      result: {
        accessToken: "fake-access-token",
        refreshToken: "fake-refresh-token",
        expiresInSeconds: 3600,
        grantedScopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
      },
    });

    const first = await handleCallback(stateToken, { code: "fake-code" }, adminUserId);
    expect(first.status).toBe("connected");

    const replay = await handleCallback(stateToken, { code: "fake-code" }, adminUserId);
    expect(replay).toEqual({ status: "error", reason: "invalid_or_expired_state", capability: null });

    if (first.status === "connected") {
      const payload = await getPayloadClient();
      await payload.delete({ collection: "google-connections", id: first.connectionId, overrideAccess: true }).catch(() => {});
    }
  });

  it("rejects a callback whose current session user doesn't match the one that started authorization", async () => {
    const { stateToken } = await startAuthorization(adminUserId, organisationId, "google-search-console", { type: "connect" });
    const result = await handleCallback(stateToken, { code: "irrelevant" }, memberUserId);
    expect(result).toEqual({ status: "error", reason: "session_mismatch", capability: "google-search-console" });
  });

  it("handles Google's own denial as a normal outcome, not an error", async () => {
    const { stateToken } = await startAuthorization(adminUserId, organisationId, "google-search-console", { type: "connect" });
    const result = await handleCallback(stateToken, { error: "access_denied" }, adminUserId);
    expect(result).toEqual({ status: "denied", capability: "google-search-console" });
  });

  it("rejects a token exchange whose returned scope grant is broader than the requested scopeProfile", async () => {
    const { stateToken } = await startAuthorization(adminUserId, organisationId, "google-analytics", { type: "connect" });

    exchangeCodeForTokens.mockResolvedValueOnce({
      ok: true,
      result: {
        accessToken: "fake-access-token",
        refreshToken: "fake-refresh-token",
        expiresInSeconds: 3600,
        // Analytics readonly plus something extra that came along for the ride.
        grantedScopes: [
          "https://www.googleapis.com/auth/analytics.readonly",
          "https://www.googleapis.com/auth/webmasters.readonly",
        ],
      },
    });

    const result = await handleCallback(stateToken, { code: "fake-code" }, adminUserId);
    expect(result).toEqual({ status: "error", reason: "unexpected_scope_grant", capability: "google-analytics" });

    const payload = await getPayloadClient();
    const leaked = await payload.find({
      collection: "google-connections",
      where: { organisation: { equals: organisationId }, scopeProfile: { equals: "google-analytics" } },
      overrideAccess: true,
    });
    expect(leaked.docs).toHaveLength(0);
  });

  describe("with a connected google-search-console connection", () => {
    let connectionId: string;

    beforeAll(async () => {
      const { stateToken } = await startAuthorization(adminUserId, organisationId, "google-search-console", { type: "connect" });
      exchangeCodeForTokens.mockResolvedValueOnce({
        ok: true,
        result: {
          accessToken: "fake-access-token",
          refreshToken: "fake-refresh-token",
          expiresInSeconds: 3600,
          grantedScopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
        },
      });
      const result = await handleCallback(stateToken, { code: "fake-code" }, adminUserId);
      if (result.status !== "connected") throw new Error("fixture setup failed: " + JSON.stringify(result));
      connectionId = result.connectionId;
    });

    afterAll(async () => {
      const payload = await getPayloadClient();
      await payload.delete({ collection: "google-connections", id: connectionId, overrideAccess: true }).catch(() => {});
    });

    it("getConnectionForCapability/listConnectionsForCapability never return a decrypted token", async () => {
      const single = await getConnectionForCapability(organisationId, connectionId, "google-search-console");
      expect(single).toMatchObject({ id: connectionId, status: "active" });
      expect(single).not.toHaveProperty("accessToken");
      expect(single).not.toHaveProperty("refreshToken");

      const list = await listConnectionsForCapability(organisationId, "google-search-console");
      expect(list.map((c) => c.id)).toContain(connectionId);

      // Wrong capability - scopeProfile mismatch, not found.
      expect(await getConnectionForCapability(organisationId, connectionId, "google-analytics")).toBeNull();
      // Wrong organisation - not found, not an error that would leak existence.
      expect(await getConnectionForCapability(otherOrganisationId, connectionId, "google-search-console")).toBeNull();
    });

    it("enforces grantedScopes/scopeProfile immutability after creation", async () => {
      const payload = await getPayloadClient();
      await expect(
        payload.update({
          collection: "google-connections",
          id: connectionId,
          data: { scopeProfile: "google-analytics" },
          overrideAccess: true,
        })
      ).rejects.toThrow();
      await expect(
        payload.update({
          collection: "google-connections",
          id: connectionId,
          data: { grantedScopes: ["https://www.googleapis.com/auth/analytics.readonly"] },
          overrideAccess: true,
        })
      ).rejects.toThrow();
    });

    it("executeGoogleApiRequest rejects a request that isn't exactly allowlisted, without ever calling fetch", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const result = await executeGoogleApiRequest(connectionId, "google-search-console", {
        method: "DELETE",
        url: "https://www.googleapis.com/webmasters/v3/sites",
      });
      expect(result).toEqual({ status: "error", reason: "not_allowlisted" });
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it("executeGoogleApiRequest refuses to execute when capability doesn't match the connection's scopeProfile", async () => {
      const result = await executeGoogleApiRequest(connectionId, "google-analytics", {
        method: "POST",
        url: "https://analyticsdata.googleapis.com/v1beta/properties/123:runReport",
      });
      expect(result).toEqual({ status: "error", reason: "capability_mismatch" });
    });

    it("executeGoogleApiRequest performs the allowlisted call itself and returns only the parsed response", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ siteEntry: [] }), { status: 200 })
      );

      const result = await executeGoogleApiRequest(connectionId, "google-search-console", {
        method: "GET",
        url: "https://www.googleapis.com/webmasters/v3/sites",
      });

      expect(result).toEqual({ status: "ok", data: { siteEntry: [] } });
      const [, init] = fetchSpy.mock.calls[0];
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer fake-access-token");
      fetchSpy.mockRestore();
    });

    it("revokeConnection cascades needs_reconnect to every mapping a registered module reports", async () => {
      const markMappingsNeedingReconnect = vi.fn().mockResolvedValue(undefined);
      registerConnectionLifecycleHooks("google-search-console", {
        isConnectionReferenced: vi.fn().mockResolvedValue(false),
        markMappingsNeedingReconnect,
        isWordPressConnectionReferenced: vi.fn().mockResolvedValue(false),
      });

      await revokeConnection(organisationId, connectionId, adminUserId);

      expect(markMappingsNeedingReconnect).toHaveBeenCalledWith(connectionId);

      const payload = await getPayloadClient();
      const doc = await payload.findByID({ collection: "google-connections", id: connectionId, overrideAccess: true });
      expect(doc.status).toBe("revoked");
    });
  });

  describe("disconnectOrDelete", () => {
    let connectionId: string;

    beforeAll(async () => {
      const { stateToken } = await startAuthorization(adminUserId, organisationId, "google-analytics", { type: "connect" });
      exchangeCodeForTokens.mockResolvedValueOnce({
        ok: true,
        result: {
          accessToken: "fake-access-token",
          refreshToken: "fake-refresh-token",
          expiresInSeconds: 3600,
          grantedScopes: ["https://www.googleapis.com/auth/analytics.readonly"],
        },
      });
      const result = await handleCallback(stateToken, { code: "fake-code" }, adminUserId);
      if (result.status !== "connected") throw new Error("fixture setup failed: " + JSON.stringify(result));
      connectionId = result.connectionId;
    });

    afterAll(async () => {
      const payload = await getPayloadClient();
      await payload.delete({ collection: "google-connections", id: connectionId, overrideAccess: true }).catch(() => {});
    });

    it("revokes instead of deleting when a registered module reports the connection is still referenced", async () => {
      registerConnectionLifecycleHooks("google-analytics", {
        isConnectionReferenced: vi.fn().mockResolvedValue(true),
        markMappingsNeedingReconnect: vi.fn().mockResolvedValue(undefined),
        isWordPressConnectionReferenced: vi.fn().mockResolvedValue(false),
      });

      const result = await disconnectOrDelete(organisationId, connectionId, adminUserId);
      expect(result).toEqual({ status: "revoked", reason: "referenced_by_mapping" });

      const payload = await getPayloadClient();
      const doc = await payload.findByID({ collection: "google-connections", id: connectionId, overrideAccess: true });
      expect(doc.status).toBe("revoked");
    });

    it("hard-deletes when nothing references the connection", async () => {
      registerConnectionLifecycleHooks("google-analytics", {
        isConnectionReferenced: vi.fn().mockResolvedValue(false),
        markMappingsNeedingReconnect: vi.fn().mockResolvedValue(undefined),
        isWordPressConnectionReferenced: vi.fn().mockResolvedValue(false),
      });

      const result = await disconnectOrDelete(organisationId, connectionId, adminUserId);
      expect(result).toEqual({ status: "deleted" });

      const payload = await getPayloadClient();
      const stillThere = await payload
        .findByID({ collection: "google-connections", id: connectionId, overrideAccess: true })
        .catch(() => null);
      expect(stillThere).toBeNull();
    });
  });
});
