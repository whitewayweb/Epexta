import { OAuthErrorCode } from "@modelcontextprotocol/server";
import { afterAll, describe, expect, it } from "vitest";
import { removeOrganisationMember } from "@/lib/organisation";
import { executeSql, sql } from "@/lib/db-sql";
import { getPayloadClient } from "@/lib/payload";
import type { OauthGrant, User } from "@/payload-types";
import { getMcpResource } from "./resources";
import { createOAuthFixtures, PKCE, REDIRECT_URI } from "./test-fixtures";
import {
  disconnectApp,
  disconnectOrganisationApp,
  exchangeAuthorizationCode,
  listConnectedApps,
  listOrganisationConnectedApps,
  OAuthTokenError,
  purgeExpiredOAuthRecords,
  refreshAccessToken,
  revokeTokenForClient,
  verifyAccessToken,
  type TokenResponse,
} from "./tokens";

const fixtures = createOAuthFixtures();
afterAll(() => fixtures.cleanup());

const wordpressResource = getMcpResource("/api/wordpress/mcp").url;
const googleResource = getMcpResource("/api/google/mcp").url;

async function expectOAuthError(promise: Promise<unknown>, code: OAuthErrorCode): Promise<void> {
  await expect(promise).rejects.toSatisfy((error) => error instanceof OAuthTokenError && error.code === code);
}

async function grantOf(accessToken: string): Promise<OauthGrant> {
  const payload = await getPayloadClient();
  const { sha256Hex } = await import("@/lib/secret-hash");
  const found = await payload.find({
    collection: "oauth-tokens",
    where: { hashedToken: { equals: sha256Hex(accessToken) } },
    depth: 1,
    overrideAccess: true,
  });
  const grant = found.docs[0]?.grant;
  if (typeof grant !== "object" || !grant) throw new Error("No grant for that token.");
  return grant;
}

async function grantRevokedReason(accessToken: string): Promise<string | null | undefined> {
  return (await grantOf(accessToken)).revokedReason;
}

function revokedById(grant: OauthGrant): string | null {
  const by = grant.revokedBy;
  return by === null || by === undefined ? null : String(typeof by === "object" ? by.id : by);
}

/** Another code + token pair for an existing user/client - a second device or a reconnect. */
async function connectAgain(userId: string, organisationId: string, clientId: string): Promise<TokenResponse> {
  const code = await fixtures.issueCode({ clientId, userId, organisationId });
  return exchangeAuthorizationCode({ code, clientId, redirectUri: REDIRECT_URI, codeVerifier: PKCE.verifier });
}

/** A superadmin acting in /admin (the local API with a user and access control on). */
async function superadmin(): Promise<User> {
  const payload = await getPayloadClient();
  const user = await payload.findByID({ collection: "users", id: await fixtures.createUser(), overrideAccess: true });
  return { ...user, role: "superadmin", collection: "users" } as User;
}

/** A user, their organisation, a registered client, and a first token pair for the WordPress resource. */
async function connectedApp(): Promise<{ userId: string; organisationId: string; clientId: string; tokens: TokenResponse }> {
  const userId = await fixtures.createUser();
  const organisationId = await fixtures.createOrganisation([{ userId, role: "admin" }]);
  const client = await fixtures.registerClient();
  const code = await fixtures.issueCode({ clientId: client.clientId, userId, organisationId });
  const tokens = await exchangeAuthorizationCode({
    code,
    clientId: client.clientId,
    redirectUri: REDIRECT_URI,
    codeVerifier: PKCE.verifier,
    resource: wordpressResource,
  });
  return { userId, organisationId, clientId: client.clientId, tokens };
}

describe("authorization code exchange", () => {
  it("issues a token pair bound to the authorized resource", async () => {
    const { userId, organisationId, tokens } = await connectedApp();

    expect(tokens.token_type).toBe("Bearer");
    expect(tokens.access_token.startsWith("epx_at_")).toBe(true);
    expect(tokens.refresh_token.startsWith("epx_rt_")).toBe(true);

    const verified = await verifyAccessToken(tokens.access_token, wordpressResource);
    expect(verified).toMatchObject({ userId, organisationId });
    // Audience binding: the same token is useless against another MCP route.
    expect(await verifyAccessToken(tokens.access_token, googleResource)).toBeNull();
  });

  it("rejects a replayed code and revokes everything it issued", async () => {
    const userId = await fixtures.createUser();
    const organisationId = await fixtures.createOrganisation([{ userId, role: "admin" }]);
    const client = await fixtures.registerClient();
    const code = await fixtures.issueCode({ clientId: client.clientId, userId, organisationId });
    const exchange = () =>
      exchangeAuthorizationCode({ code, clientId: client.clientId, redirectUri: REDIRECT_URI, codeVerifier: PKCE.verifier });

    const first = await exchange();
    await expectOAuthError(exchange(), OAuthErrorCode.InvalidGrant);
    expect(await verifyAccessToken(first.access_token, wordpressResource)).toBeNull();
    expect(await grantRevokedReason(first.access_token)).toBe("code_replay");
  });

  it("lets only one of two concurrent redemptions of the same code succeed", async () => {
    const userId = await fixtures.createUser();
    const organisationId = await fixtures.createOrganisation([{ userId, role: "admin" }]);
    const client = await fixtures.registerClient();
    const code = await fixtures.issueCode({ clientId: client.clientId, userId, organisationId });
    const exchange = () =>
      exchangeAuthorizationCode({ code, clientId: client.clientId, redirectUri: REDIRECT_URI, codeVerifier: PKCE.verifier });

    const results = await Promise.allSettled([exchange(), exchange()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("rejects a wrong PKCE verifier, redirect URI, client, or resource", async () => {
    const userId = await fixtures.createUser();
    const organisationId = await fixtures.createOrganisation([{ userId, role: "admin" }]);
    const client = await fixtures.registerClient();
    const otherClient = await fixtures.registerClient();
    const code = await fixtures.issueCode({ clientId: client.clientId, userId, organisationId });
    const base = { code, clientId: client.clientId, redirectUri: REDIRECT_URI, codeVerifier: PKCE.verifier };

    await expectOAuthError(
      exchangeAuthorizationCode({ ...base, codeVerifier: `${PKCE.verifier.slice(0, -1)}A` }),
      OAuthErrorCode.InvalidGrant
    );
    await expectOAuthError(
      exchangeAuthorizationCode({ ...base, redirectUri: "https://client.example.test/other" }),
      OAuthErrorCode.InvalidGrant
    );
    await expectOAuthError(exchangeAuthorizationCode({ ...base, clientId: otherClient.clientId }), OAuthErrorCode.InvalidGrant);
    await expectOAuthError(exchangeAuthorizationCode({ ...base, resource: googleResource }), OAuthErrorCode.InvalidTarget);

    // None of those attempts consumed the code.
    await expect(exchangeAuthorizationCode(base)).resolves.toHaveProperty("access_token");
  });
});

describe("refresh token rotation", () => {
  it("rotates, tolerates one retry of the previous token, and revokes the grant on older reuse", async () => {
    const { clientId, tokens } = await connectedApp();
    const refresh = (refreshToken: string) => refreshAccessToken({ refreshToken, clientId, resource: wordpressResource });

    const second = await refresh(tokens.refresh_token);
    expect(second.refresh_token).not.toBe(tokens.refresh_token);
    expect(await verifyAccessToken(second.access_token, wordpressResource)).not.toBeNull();

    // The first token is now "previous": still accepted once (a lost response being retried).
    const third = await refresh(tokens.refresh_token);

    // Now it's two generations old - treated as theft, and the whole grant goes.
    await expectOAuthError(refresh(tokens.refresh_token), OAuthErrorCode.InvalidGrant);
    expect(await verifyAccessToken(third.access_token, wordpressResource)).toBeNull();
    expect(await grantRevokedReason(third.access_token)).toBe("refresh_reuse");
  });

  it("survives two concurrent refreshes with the same token", async () => {
    const { clientId, tokens } = await connectedApp();
    const refresh = () => refreshAccessToken({ refreshToken: tokens.refresh_token, clientId });

    const results = await Promise.all([refresh(), refresh()]);
    for (const result of results) {
      expect(await verifyAccessToken(result.access_token, wordpressResource)).not.toBeNull();
    }
  });

  it("refuses a refresh token presented by a different client", async () => {
    const { tokens } = await connectedApp();
    const otherClient = await fixtures.registerClient();
    await expectOAuthError(
      refreshAccessToken({ refreshToken: tokens.refresh_token, clientId: otherClient.clientId }),
      OAuthErrorCode.InvalidGrant
    );
  });
});

describe("grant lifecycle", () => {
  it("lists a connection until the user disconnects it, recording who did", async () => {
    const { userId, clientId, tokens } = await connectedApp();

    const apps = await listConnectedApps(userId);
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({ clientName: "Test client", connectorName: "WordPress", sessions: 1, userId });

    const otherUserId = await fixtures.createUser();
    expect(await disconnectApp(otherUserId, apps[0].connectionId)).toBe(false);
    expect(await disconnectApp(userId, apps[0].connectionId)).toBe(true);

    expect(await listConnectedApps(userId)).toHaveLength(0);
    expect(await verifyAccessToken(tokens.access_token, wordpressResource)).toBeNull();
    await expectOAuthError(
      refreshAccessToken({ refreshToken: tokens.refresh_token, clientId }),
      OAuthErrorCode.InvalidGrant
    );
    const grant = await grantOf(tokens.access_token);
    expect(grant.revokedReason).toBe("user");
    expect(revokedById(grant)).toBe(userId);
  });

  it("groups reconnects and second devices into one row, and disconnects them together", async () => {
    const { userId, organisationId, clientId, tokens } = await connectedApp();
    const second = await connectAgain(userId, organisationId, clientId);

    // Both sessions keep working - a reconnect never signs another device out.
    expect(await verifyAccessToken(tokens.access_token, wordpressResource)).not.toBeNull();
    expect(await verifyAccessToken(second.access_token, wordpressResource)).not.toBeNull();

    const apps = await listConnectedApps(userId);
    expect(apps).toHaveLength(1);
    expect(apps[0].sessions).toBe(2);

    await disconnectApp(userId, apps[0].connectionId);
    expect(await verifyAccessToken(tokens.access_token, wordpressResource)).toBeNull();
    expect(await verifyAccessToken(second.access_token, wordpressResource)).toBeNull();
  });

  it("hides a connection once its refresh tokens have all expired", async () => {
    const { userId, tokens } = await connectedApp();
    const grant = await grantOf(tokens.access_token);
    await executeSql(sql`
      UPDATE oauth_tokens SET expires_at = now() - interval '1 minute'
      WHERE grant_id = ${Number(grant.id)} AND token_type = 'refresh'`);
    expect(await listConnectedApps(userId)).toHaveLength(0);
  });

  it("revokes a member's grants as soon as they're removed from the organisation", async () => {
    const adminId = await fixtures.createUser();
    const memberId = await fixtures.createUser();
    const organisationId = await fixtures.createOrganisation([
      { userId: adminId, role: "admin" },
      { userId: memberId, role: "member" },
    ]);
    const client = await fixtures.registerClient();
    const tokens = await connectAgain(memberId, organisationId, client.clientId);
    expect(await verifyAccessToken(tokens.access_token, wordpressResource)).not.toBeNull();

    await removeOrganisationMember(organisationId, memberId);

    // Revoked by the removal itself, before the member's app makes another request.
    expect(await grantRevokedReason(tokens.access_token)).toBe("member_removed");
    expect(await verifyAccessToken(tokens.access_token, wordpressResource)).toBeNull();
    expect(await listConnectedApps(memberId)).toHaveLength(0);
  });

  it("still labels a removal made by a superadmin in /admin as member_removed", async () => {
    const adminId = await fixtures.createUser();
    const memberId = await fixtures.createUser();
    const organisationId = await fixtures.createOrganisation([
      { userId: adminId, role: "admin" },
      { userId: memberId, role: "member" },
    ]);
    const client = await fixtures.registerClient();
    const tokens = await connectAgain(memberId, organisationId, client.clientId);

    const payload = await getPayloadClient();
    await payload.update({
      collection: "organisations",
      id: organisationId,
      data: { members: [{ user: Number(adminId), role: "admin" }] },
      user: await superadmin(),
      overrideAccess: false,
    });

    const grant = await grantOf(tokens.access_token);
    expect(grant.revokedReason).toBe("member_removed");
    expect(revokedById(grant)).toBeNull();
  });

  it("lets an organisation admin see and disconnect members' connections, and nobody else", async () => {
    const adminId = await fixtures.createUser();
    const memberId = await fixtures.createUser();
    const organisationId = await fixtures.createOrganisation([
      { userId: adminId, role: "admin" },
      { userId: memberId, role: "member" },
    ]);
    const client = await fixtures.registerClient();
    const tokens = await connectAgain(memberId, organisationId, client.clientId);

    expect(await listOrganisationConnectedApps(memberId, organisationId)).toBeNull();
    const apps = await listOrganisationConnectedApps(adminId, organisationId);
    expect(apps).toHaveLength(1);
    expect(apps?.[0].userId).toBe(memberId);
    expect(apps?.[0].userEmail).toMatch(/@example\.com$/);

    const connectionId = apps![0].connectionId;
    expect(await disconnectOrganisationApp(memberId, organisationId, connectionId)).toBe(false);
    expect(await verifyAccessToken(tokens.access_token, wordpressResource)).not.toBeNull();

    expect(await disconnectOrganisationApp(adminId, organisationId, connectionId)).toBe(true);
    expect(await verifyAccessToken(tokens.access_token, wordpressResource)).toBeNull();
    const grant = await grantOf(tokens.access_token);
    expect(grant.revokedReason).toBe("admin");
    expect(revokedById(grant)).toBe(adminId);
  });

  it("lets a superadmin revoke a grant in /admin, and change nothing else", async () => {
    const { tokens } = await connectedApp();
    const grant = await grantOf(tokens.access_token);
    const support = await superadmin();
    const payload = await getPayloadClient();

    // An edit that doesn't revoke is dropped entirely.
    await payload.update({
      collection: "oauth-grants",
      id: grant.id,
      data: { resource: "https://elsewhere.example/mcp" },
      user: support,
      overrideAccess: false,
    });
    expect((await grantOf(tokens.access_token)).resource).toBe(wordpressResource);

    await payload.update({
      collection: "oauth-grants",
      id: grant.id,
      data: { revokedAt: new Date().toISOString(), resource: "https://elsewhere.example/mcp", revokedReason: "user" },
      user: support,
      overrideAccess: false,
    });
    const revoked = await grantOf(tokens.access_token);
    expect(revoked.resource).toBe(wordpressResource);
    expect(revoked.revokedReason).toBe("admin");
    expect(revokedById(revoked)).toBe(String(support.id));
    expect(await verifyAccessToken(tokens.access_token, wordpressResource)).toBeNull();
  });

  it("keeps grants out of reach of anyone but a superadmin", async () => {
    const { userId } = await connectedApp();
    const payload = await getPayloadClient();
    const owner = await payload.findByID({ collection: "users", id: userId, overrideAccess: true });
    await expect(
      payload.find({ collection: "oauth-grants", user: { ...owner, collection: "users" }, overrideAccess: false })
    ).rejects.toBeTruthy();
    await expect(
      payload.find({ collection: "oauth-tokens", user: await superadmin(), overrideAccess: false })
    ).rejects.toBeTruthy();
  });

  it("lets a client revoke its own tokens, but not another client's", async () => {
    const { clientId, tokens } = await connectedApp();
    const otherClient = await fixtures.registerClient();

    await expectOAuthError(revokeTokenForClient(tokens.refresh_token, otherClient.clientId), OAuthErrorCode.UnauthorizedClient);
    expect(await verifyAccessToken(tokens.access_token, wordpressResource)).not.toBeNull();

    await revokeTokenForClient(tokens.refresh_token, clientId);
    expect(await verifyAccessToken(tokens.access_token, wordpressResource)).toBeNull();
    // Unknown tokens are not an error (RFC 7009 section 2.2).
    await expect(revokeTokenForClient("epx_rt_unknown", clientId)).resolves.toBeUndefined();
  });
});

describe("cleanup", () => {
  it("purges expired codes and tokens and idle unreferenced clients, and keeps everything live", async () => {
    const { userId, organisationId, tokens } = await connectedApp();
    const client = await fixtures.registerClient();
    await fixtures.issueCode({ clientId: client.clientId, userId, organisationId });
    const idleClient = await fixtures.registerClient();

    const payload = await getPayloadClient();
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const stale = await payload.create({
      collection: "oauth-authorization-codes",
      data: {
        hashedCode: `stale-${Date.now()}-${Math.random()}`,
        client: Number(client.docId),
        user: Number(userId),
        organisation: Number(organisationId),
        resource: wordpressResource,
        scopes: [],
        redirectUri: REDIRECT_URI,
        codeChallenge: PKCE.challenge,
        expiresAt: twoDaysAgo,
      },
      overrideAccess: true,
    });
    // One live access token and one long-expired one under the same grant.
    const grant = await grantOf(tokens.access_token);
    const staleToken = await payload.create({
      collection: "oauth-tokens",
      data: { hashedToken: `stale-${Date.now()}-${Math.random()}`, grant: Number(grant.id), tokenType: "access", expiresAt: twoDaysAgo },
      overrideAccess: true,
    });
    await executeSql(sql`
      UPDATE oauth_clients SET created_at = now() - interval '60 days', last_used_at = NULL
      WHERE id = ${Number(idleClient.docId)}`);

    const result = await purgeExpiredOAuthRecords();
    expect(result.authorizationCodes).toBeGreaterThanOrEqual(1);
    expect(result.tokens).toBeGreaterThanOrEqual(1);
    expect(result.clients).toBeGreaterThanOrEqual(1);

    const exists = async (collection: "oauth-authorization-codes" | "oauth-tokens" | "oauth-clients", id: string | number) =>
      (await payload.count({ collection, where: { id: { equals: id } }, overrideAccess: true })).totalDocs > 0;
    expect(await exists("oauth-authorization-codes", stale.id)).toBe(false);
    expect(await exists("oauth-tokens", staleToken.id)).toBe(false);
    expect(await exists("oauth-clients", idleClient.docId)).toBe(false);

    // Live: the pending code, the client it references, and the connected app's tokens.
    const live = await payload.count({
      collection: "oauth-authorization-codes",
      where: { client: { equals: Number(client.docId) } },
      overrideAccess: true,
    });
    expect(live.totalDocs).toBe(1);
    expect(await exists("oauth-clients", client.docId)).toBe(true);
    expect(await verifyAccessToken(tokens.access_token, wordpressResource)).not.toBeNull();
  });
});
