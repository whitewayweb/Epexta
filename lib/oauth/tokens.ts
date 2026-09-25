import { OAuthErrorCode } from "@modelcontextprotocol/server";
import { runAfterResponse } from "@/lib/after-response";
import { executeSql, sql } from "@/lib/db-sql";
import { runInTransaction, type TransactionReq } from "@/lib/db-transactions";
import { getOrganisationRole } from "@/lib/organisation";
import { getPayloadClient } from "@/lib/payload";
import { relationshipId } from "@/lib/relationship";
import { randomSecret, sha256Hex } from "@/lib/secret-hash";
import type { OauthClient, OauthGrant, OauthToken } from "@/payload-types";
import { logOAuthEvent } from "./audit";
import { clientPublisherHost, findKnownClient, touchClient } from "./clients";
import {
  ACCESS_TOKEN_TTL_MS,
  EXPIRED_RECORD_RETENTION_MS,
  GRANT_LAST_USED_WRITE_INTERVAL_MS,
  GRANT_MAX_LIFETIME_MS,
  REFRESH_TOKEN_IDLE_TTL_MS,
  TOKEN_PREFIX,
  UNUSED_CLIENT_RETENTION_MS,
} from "./config";
import { findMcpResourceByUrl } from "./resources";
import { verifyPkceS256 } from "./validation";

// Grants and the tokens issued under them: issuance, rotation, verification, revocation,
// the user's connected-apps view, and expiry housekeeping - see OAUTH_CONNECTOR_PLAN.md
// "/oauth/token", "Token format and lifetimes", and "Connected apps".
//
// Tokens are opaque random strings stored only as SHA-256 digests, never JWTs: every MCP
// request re-reads the grant anyway (so a revoked grant, a removed member, or a disabled
// module takes effect on the very next request, per CLAUDE.md), which makes a signed,
// self-contained token pure overhead.
//
// Race safety comes from oauth-tokens.issuedFrom's unique index rather than a
// check-then-insert: each refresh token records "code:<id>" or "refresh:<parentId>" as its
// origin, so only one redemption of a code and one rotation of a refresh token can ever
// commit. A loser's transaction rolls back and is then handled as a replay (codes) or
// retried against the new state (refresh).

/** An RFC 6749 token-endpoint error. `message` becomes `error_description`, so keep it client-safe. */
export class OAuthTokenError extends Error {
  constructor(
    readonly code: OAuthErrorCode,
    message: string
  ) {
    super(message);
  }
}

export interface TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
}

type TokenType = OauthToken["tokenType"];

async function findTokenByRaw(raw: string): Promise<OauthToken | null> {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "oauth-tokens",
    where: { hashedToken: { equals: sha256Hex(raw) } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return result.docs[0] ?? null;
}

async function findTokenIssuedFrom(issuedFrom: string): Promise<OauthToken | null> {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "oauth-tokens",
    where: { issuedFrom: { equals: issuedFrom } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return result.docs[0] ?? null;
}

async function findGrant(grantId: string): Promise<OauthGrant | null> {
  const payload = await getPayloadClient();
  return payload.findByID({ collection: "oauth-grants", id: grantId, depth: 0, overrideAccess: true }).catch(() => null);
}

type GrantRevocationReason = NonNullable<OauthGrant["revokedReason"]>;

/**
 * Revokes grants: every access and refresh token issued under them stops working on its
 * next use, since token verification always re-reads the grant. Idempotent - an already
 * revoked grant keeps its original revokedAt/revokedReason/revokedBy. `revokedBy` is the
 * user who asked for it, for a user or administrator revocation.
 */
async function revokeGrants(grantIds: string[], reason: GrantRevocationReason, revokedBy?: string): Promise<void> {
  if (grantIds.length === 0) return;
  const payload = await getPayloadClient();
  const result = await payload.update({
    collection: "oauth-grants",
    where: { id: { in: grantIds.map(Number) }, revokedAt: { exists: false } },
    data: {
      revokedAt: new Date().toISOString(),
      revokedReason: reason,
      ...(revokedBy ? { revokedBy: Number(revokedBy) } : {}),
    },
    depth: 0,
    overrideAccess: true,
  });
  if (result.docs.length > 0) {
    logOAuthEvent("grants_revoked", { reason, by: revokedBy, grantIds: result.docs.map((grant) => String(grant.id)) });
  }
}

function isExpired(isoDate: string): boolean {
  return new Date(isoDate).getTime() <= Date.now();
}

/** A refresh token lapses after the idle window, and never outlives its grant's maximum lifetime. */
function refreshTokenExpiry(grantCreatedAt: string): Date {
  const idle = Date.now() + REFRESH_TOKEN_IDLE_TTL_MS;
  const absolute = new Date(grantCreatedAt).getTime() + GRANT_MAX_LIFETIME_MS;
  return new Date(Math.min(idle, absolute));
}

/**
 * A grant is usable only while unrevoked and while its user is still a member of the
 * organisation it was granted for. Removing a member revokes their grants immediately
 * (collections/Organisations.ts); this per-request re-check is the backstop, and revokes
 * a departed member's grant on first sight so it never stays silently dead.
 */
async function isGrantActive(grant: Pick<OauthGrant, "id" | "revokedAt">, isMember: () => Promise<boolean>): Promise<boolean> {
  if (grant.revokedAt) return false;
  if (await isMember()) return true;
  await revokeGrants([String(grant.id)], "member_removed");
  return false;
}

function isGrantMember(grant: OauthGrant): () => Promise<boolean> {
  return async () =>
    (await getOrganisationRole(relationshipId(grant.organisation), relationshipId(grant.user))) !== null;
}

/** Mints one access + refresh token pair under a grant. The refresh insert goes first, so a lost `issuedFrom` race aborts before anything else is written. */
async function mintTokens(
  grantId: string | number,
  issuedFrom: string,
  refreshExpiresAt: Date,
  req: TransactionReq
): Promise<TokenResponse> {
  const payload = await getPayloadClient();
  const accessToken = randomSecret(TOKEN_PREFIX.access);
  const refreshToken = randomSecret(TOKEN_PREFIX.refresh);

  const create = (raw: string, tokenType: TokenType, expiresAt: Date, origin?: string) =>
    payload.create({
      collection: "oauth-tokens",
      data: {
        hashedToken: sha256Hex(raw),
        grant: Number(grantId),
        tokenType,
        issuedFrom: origin,
        expiresAt: expiresAt.toISOString(),
      },
      req,
      overrideAccess: true,
    });

  await create(refreshToken, "refresh", refreshExpiresAt, issuedFrom);
  await create(accessToken, "access", new Date(Date.now() + ACCESS_TOKEN_TTL_MS));

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    refresh_token: refreshToken,
  };
}

function invalidGrant(message: string): OAuthTokenError {
  return new OAuthTokenError(OAuthErrorCode.InvalidGrant, message);
}

/** RFC 8707: a `resource` sent to the token endpoint must name the same resource the grant is for. */
function assertSameResource(requested: string | undefined, grantedResource: string): void {
  if (requested !== undefined && findMcpResourceByUrl(requested)?.url !== grantedResource) {
    throw new OAuthTokenError(OAuthErrorCode.InvalidTarget, "The resource does not match the authorized resource.");
  }
}

/** Handles a code that has already produced tokens: RFC 6749 section 4.1.2 - revoke what it issued. */
async function rejectReplayedCode(issued: OauthToken): Promise<never> {
  await revokeGrants([relationshipId(issued.grant)], "code_replay");
  throw invalidGrant("The authorization code has already been used.");
}

export interface CodeExchangeInput {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  resource?: string;
}

/** grant_type=authorization_code: redeems a code for the grant's first token pair. */
export async function exchangeAuthorizationCode(input: CodeExchangeInput): Promise<TokenResponse> {
  const payload = await getPayloadClient();
  const found = await payload.find({
    collection: "oauth-authorization-codes",
    where: { hashedCode: { equals: sha256Hex(input.code) } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const code = found.docs[0];
  if (!code) throw invalidGrant("The authorization code is invalid.");

  const client = await findKnownClient(input.clientId);
  if (!client || client.id !== relationshipId(code.client)) {
    throw invalidGrant("The authorization code was issued to a different client.");
  }

  const issuedFrom = `code:${code.id}`;
  const alreadyIssued = await findTokenIssuedFrom(issuedFrom);
  if (alreadyIssued) return rejectReplayedCode(alreadyIssued);

  if (isExpired(code.expiresAt)) throw invalidGrant("The authorization code has expired.");
  if (input.redirectUri !== code.redirectUri) throw invalidGrant("redirect_uri does not match the authorization request.");
  if (!verifyPkceS256(input.codeVerifier, code.codeChallenge)) throw invalidGrant("PKCE verification failed.");
  assertSameResource(input.resource, code.resource);

  let issued: { grantId: string; minted: TokenResponse };
  try {
    issued = await runInTransaction(async (req) => {
      const grant = await payload.create({
        collection: "oauth-grants",
        data: {
          user: Number(relationshipId(code.user)),
          organisation: Number(relationshipId(code.organisation)),
          client: Number(client.id),
          resource: code.resource,
          scopes: code.scopes ?? [],
        },
        req,
        overrideAccess: true,
      });
      const minted = await mintTokens(grant.id, issuedFrom, refreshTokenExpiry(grant.createdAt), req);
      return { grantId: String(grant.id), minted };
    });
  } catch (error) {
    // A concurrent redemption of the same code won the issuedFrom race - that's a replay.
    const winner = await findTokenIssuedFrom(issuedFrom);
    if (winner) return rejectReplayedCode(winner);
    throw error;
  }

  logOAuthEvent("grant_created", {
    grantId: issued.grantId,
    userId: relationshipId(code.user),
    organisationId: relationshipId(code.organisation),
    clientId: client.clientId,
    resource: code.resource,
  });
  runAfterResponse("oauth", () => touchClient(client.id));
  return issued.minted;
}

export interface RefreshInput {
  refreshToken: string;
  clientId: string;
  resource?: string;
}

/**
 * grant_type=refresh_token, with rotation (required for public clients by OAuth 2.1 and
 * the MCP spec). Following Cloudflare's workers-oauth-provider, the *previous* refresh
 * token stays usable until its successor is itself used, so a client whose refresh
 * response was lost in transit can retry instead of being locked out. Presenting any
 * older token is treated as theft: the whole grant is revoked.
 */
export async function refreshAccessToken(input: RefreshInput, isRetry = false): Promise<TokenResponse> {
  const presented = await findTokenByRaw(input.refreshToken);
  if (!presented || presented.tokenType !== "refresh") throw invalidGrant("The refresh token is invalid.");

  const grant = await findGrant(relationshipId(presented.grant));
  if (!grant || !(await isGrantActive(grant, isGrantMember(grant)))) {
    throw invalidGrant("The refresh token has been revoked.");
  }

  const client = await findKnownClient(input.clientId);
  if (!client || client.id !== relationshipId(grant.client)) {
    throw invalidGrant("The refresh token was issued to a different client.");
  }
  assertSameResource(input.resource, grant.resource);
  if (isExpired(presented.expiresAt)) throw invalidGrant("The refresh token has expired.");

  // Rotate from the current head of this token's chain: the presented token itself if it
  // has no successor yet, or its successor if the presented one is the previous token.
  let parent = presented;
  const successor = await findTokenIssuedFrom(`refresh:${presented.id}`);
  if (successor) {
    if (await findTokenIssuedFrom(`refresh:${successor.id}`)) {
      await revokeGrants([String(grant.id)], "refresh_reuse");
      throw invalidGrant("The refresh token has already been used.");
    }
    parent = successor;
  }

  const expiresAt = refreshTokenExpiry(grant.createdAt);
  if (expiresAt.getTime() <= Date.now()) throw invalidGrant("This authorization has expired; please reconnect.");

  const issuedFrom = `refresh:${parent.id}`;
  try {
    return await runInTransaction((req) => mintTokens(grant.id, issuedFrom, expiresAt, req));
  } catch (error) {
    // A concurrent refresh rotated the same token first - re-evaluate against the new chain
    // state once (this request's token is now the "previous" one, which is still allowed).
    if (!isRetry && (await findTokenIssuedFrom(issuedFrom))) return refreshAccessToken(input, true);
    throw error;
  }
}

export interface VerifiedAccessToken {
  grantId: string;
  userId: string;
  organisationId: string;
  /** The OAuth client_id the token was issued to. */
  clientId: string;
  scopes: string[];
  /** Seconds since epoch, per the MCP SDK's AuthInfo.expiresAt. */
  expiresAt: number;
}

interface AccessTokenRow extends Record<string, unknown> {
  token_type: OauthToken["tokenType"];
  expires_at: Date | string;
  grant_id: number;
  user_id: number;
  organisation_id: number;
  resource: string;
  scopes: unknown;
  last_used_at: Date | string | null;
  revoked_at: Date | string | null;
  client_id: string;
  is_member: boolean;
}

/**
 * Verifies an access token presented to one MCP resource: known, unexpired, issued for
 * exactly this resource (RFC 8707 audience binding - a token for the WordPress route is
 * rejected by the Google route), and under a grant that is still active. Returns null
 * for anything invalid; the caller answers 401 so the client refreshes or re-authorizes.
 *
 * This runs on every MCP request, so the token, its grant, its client's client_id, and the
 * membership check are one SQL round trip rather than the local API's query per populated
 * relationship; the throttled "last used" write happens after the response is sent.
 */
export async function verifyAccessToken(raw: string, resourceUrl: string): Promise<VerifiedAccessToken | null> {
  if (!raw.startsWith(TOKEN_PREFIX.access)) return null;

  const { rows } = await executeSql<AccessTokenRow>(sql`
    SELECT t.token_type, t.expires_at,
           g.id AS grant_id, g.user_id, g.organisation_id, g.resource, g.scopes, g.last_used_at, g.revoked_at,
           c.client_id,
           EXISTS (
             SELECT 1 FROM organisations_members m
             WHERE m._parent_id = g.organisation_id AND m.user_id = g.user_id
           ) AS is_member
    FROM oauth_tokens t
    JOIN oauth_grants g ON g.id = t.grant_id
    JOIN oauth_clients c ON c.id = g.client_id
    WHERE t.hashed_token = ${sha256Hex(raw)}
    LIMIT 1`);
  const row = rows[0];
  if (!row || row.token_type !== "access" || new Date(row.expires_at).getTime() <= Date.now()) return null;
  if (row.resource !== resourceUrl) return null;

  const grant = { id: row.grant_id, revokedAt: row.revoked_at ? String(row.revoked_at) : null };
  if (!(await isGrantActive(grant, async () => row.is_member))) return null;

  const lastUsedAt = row.last_used_at ? new Date(row.last_used_at).getTime() : 0;
  if (Date.now() - lastUsedAt > GRANT_LAST_USED_WRITE_INTERVAL_MS) {
    runAfterResponse("oauth", async () => {
      const payload = await getPayloadClient();
      await payload.update({
        collection: "oauth-grants",
        id: row.grant_id,
        data: { lastUsedAt: new Date().toISOString() },
        depth: 0,
        overrideAccess: true,
      });
    });
  }

  return {
    grantId: String(row.grant_id),
    userId: String(row.user_id),
    organisationId: String(row.organisation_id),
    clientId: row.client_id,
    scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : [],
    expiresAt: Math.floor(new Date(row.expires_at).getTime() / 1000),
  };
}

/**
 * RFC 7009 revocation. Revoking either token of a grant revokes the whole grant (the
 * spec allows this, and it's what a user disconnecting from the client's side expects).
 * An unknown token is not an error (RFC 7009 section 2.2); a token belonging to a
 * different client is refused.
 */
export async function revokeTokenForClient(raw: string, clientId: string): Promise<void> {
  const token = await findTokenByRaw(raw);
  if (!token) return;

  const grant = await findGrant(relationshipId(token.grant));
  if (!grant) return;

  const client = await findKnownClient(clientId);
  if (!client || client.id !== relationshipId(grant.client)) {
    throw new OAuthTokenError(OAuthErrorCode.UnauthorizedClient, "This token was not issued to this client.");
  }
  await revokeGrants([String(grant.id)], "client");
}

// --- Connected apps (/settings/connected-apps) ------------------------------------------
//
// One row per connection: one person's one app on one connector. An app can hold several
// live grants for the same connector - Claude Code on two machines shares one CIMD
// client_id, and every reconnect creates a new grant - so those are grouped rather than
// revoked on reconnect (which would sign the other machine out). Disconnecting a row
// revokes every grant in it. Grants whose refresh tokens have all expired can't be used
// again and aren't listed.

export interface ConnectedApp {
  /** Opaque, stable id of the row - what Disconnect posts back. */
  connectionId: string;
  userId: string;
  userEmail: string;
  clientName: string;
  /** See clientPublisherHost - shown alongside the client's self-chosen name. */
  clientHost: string | null;
  connectorName: string;
  /** When the newest grant in the row was approved. */
  connectedAt: string;
  lastUsedAt: string | null;
  /** How many live grants (devices or sessions) the row holds. */
  sessions: number;
}

/** A connected-apps row, plus the grants it covers (never sent to the browser). */
interface Connection {
  app: ConnectedApp;
  grantIds: string[];
}

interface ConnectionRow extends Record<string, unknown> {
  grant_id: number;
  user_id: number;
  email: string;
  resource: string;
  created_at: Date | string;
  last_used_at: Date | string | null;
  client_id: string;
  registration_type: OauthClient["registrationType"];
  client_name: string;
  client_uri: string | null;
}

/** Live connections for one user or one organisation, newest first. */
async function loadConnections(scope: { userId: string } | { organisationId: string }): Promise<Connection[]> {
  const scopeFilter =
    "userId" in scope ? sql`g.user_id = ${Number(scope.userId)}` : sql`g.organisation_id = ${Number(scope.organisationId)}`;
  const { rows } = await executeSql<ConnectionRow>(sql`
    SELECT g.id AS grant_id, g.user_id, u.email, g.resource, g.created_at, g.last_used_at,
           c.client_id, c.registration_type, c.client_name, c.client_uri
    FROM oauth_grants g
    JOIN oauth_clients c ON c.id = g.client_id
    JOIN users u ON u.id = g.user_id
    WHERE ${scopeFilter}
      AND g.revoked_at IS NULL
      AND EXISTS (
        SELECT 1 FROM oauth_tokens t
        WHERE t.grant_id = g.id AND t.token_type = 'refresh' AND t.expires_at > now()
      )
    ORDER BY g.created_at DESC
    LIMIT 1000`);

  const connections = new Map<string, Connection>();
  for (const row of rows) {
    const client = {
      registrationType: row.registration_type,
      clientId: row.client_id,
      clientUri: row.client_uri,
    };
    const clientHost = clientPublisherHost(client);
    // A CIMD client is identified by its client_id; DCR registers a new client per
    // connection, so those group by what the user sees instead: name and publisher host.
    const clientKey = row.registration_type === "cimd" ? row.client_id : `dcr:${row.client_name}:${clientHost ?? ""}`;
    const connectionId = sha256Hex(`${row.user_id}|${row.resource}|${clientKey}`).slice(0, 32);
    const lastUsedAt = row.last_used_at ? new Date(row.last_used_at).toISOString() : null;

    const existing = connections.get(connectionId);
    if (existing) {
      existing.grantIds.push(String(row.grant_id));
      existing.app.sessions += 1;
      if (lastUsedAt && (!existing.app.lastUsedAt || lastUsedAt > existing.app.lastUsedAt)) {
        existing.app.lastUsedAt = lastUsedAt;
      }
      continue;
    }
    connections.set(connectionId, {
      grantIds: [String(row.grant_id)],
      app: {
        connectionId,
        userId: String(row.user_id),
        userEmail: row.email,
        clientName: row.client_name,
        clientHost,
        connectorName: findMcpResourceByUrl(row.resource)?.name ?? row.resource,
        connectedAt: new Date(row.created_at).toISOString(),
        lastUsedAt,
        sessions: 1,
      },
    });
  }
  return [...connections.values()];
}

/** The user's own live connections - the "Your connected apps" table. */
export async function listConnectedApps(userId: string): Promise<ConnectedApp[]> {
  return (await loadConnections({ userId })).map((connection) => connection.app);
}

/** Disconnects one of the user's own connections. False if it isn't theirs (or no longer exists). */
export async function disconnectApp(userId: string, connectionId: string): Promise<boolean> {
  const connection = (await loadConnections({ userId })).find((c) => c.app.connectionId === connectionId);
  if (!connection) return false;
  await revokeGrants(connection.grantIds, "user", userId);
  return true;
}

async function isOrganisationAdmin(userId: string, organisationId: string): Promise<boolean> {
  return (await getOrganisationRole(organisationId, userId)) === "admin";
}

/** Every member's live connections, for an organisation admin. Null if `actorUserId` isn't one. */
export async function listOrganisationConnectedApps(
  actorUserId: string,
  organisationId: string
): Promise<ConnectedApp[] | null> {
  if (!(await isOrganisationAdmin(actorUserId, organisationId))) return null;
  return (await loadConnections({ organisationId })).map((connection) => connection.app);
}

/** An organisation admin disconnects any member's connection. False if not allowed or not found. */
export async function disconnectOrganisationApp(
  actorUserId: string,
  organisationId: string,
  connectionId: string
): Promise<boolean> {
  if (!(await isOrganisationAdmin(actorUserId, organisationId))) return false;
  const connection = (await loadConnections({ organisationId })).find((c) => c.app.connectionId === connectionId);
  if (!connection) return false;
  await revokeGrants(connection.grantIds, connection.app.userId === actorUserId ? "user" : "admin", actorUserId);
  return true;
}

// --- Housekeeping (/api/cron/oauth-cleanup) ---------------------------------------------

export interface OAuthCleanupResult {
  authorizationCodes: number;
  tokens: number;
  clients: number;
}

/** Rows deleted per statement, so one run never holds a long lock or a huge transaction. */
const PURGE_BATCH_SIZE = 5000;

/** Repeats a batched DELETE until it deletes fewer rows than a full batch; returns the total. */
async function deleteInBatches(statement: () => ReturnType<typeof sql>): Promise<number> {
  let total = 0;
  for (;;) {
    const { rowCount } = await executeSql(statement());
    total += rowCount;
    if (rowCount < PURGE_BATCH_SIZE) return total;
  }
}

/**
 * Housekeeping for the OAuth tables, run daily by app/api/cron/oauth-cleanup. Deletes only
 * records that can no longer do anything: expired codes and tokens (after a short
 * retention window), and client records nothing references that haven't been used in a
 * while (DCR registers a new client per connection, so these accumulate). Grants are
 * never deleted here - revoked grants are the audit trail.
 *
 * Plain batched SQL, not the local API: these tables grow with every refresh (a token pair
 * per client per hour), and payload.delete would load every row it deletes. No collection
 * hook depends on these deletes; dependent rows (payload_locked_documents_rels) cascade.
 */
export async function purgeExpiredOAuthRecords(now = new Date()): Promise<OAuthCleanupResult> {
  const expiredBefore = new Date(now.getTime() - EXPIRED_RECORD_RETENTION_MS).toISOString();
  const staleBefore = new Date(now.getTime() - UNUSED_CLIENT_RETENTION_MS).toISOString();

  const authorizationCodes = await deleteInBatches(
    () => sql`
      DELETE FROM oauth_authorization_codes WHERE id IN (
        SELECT id FROM oauth_authorization_codes WHERE expires_at < ${expiredBefore} LIMIT ${PURGE_BATCH_SIZE}
      )`
  );
  const tokens = await deleteInBatches(
    () => sql`
      DELETE FROM oauth_tokens WHERE id IN (
        SELECT id FROM oauth_tokens WHERE expires_at < ${expiredBefore} LIMIT ${PURGE_BATCH_SIZE}
      )`
  );
  // Clients idle (or never used) too long that no grant or pending code references.
  const clients = await deleteInBatches(
    () => sql`
      DELETE FROM oauth_clients WHERE id IN (
        SELECT c.id FROM oauth_clients c
        WHERE COALESCE(c.last_used_at, c.created_at) < ${staleBefore}
          AND NOT EXISTS (SELECT 1 FROM oauth_grants g WHERE g.client_id = c.id)
          AND NOT EXISTS (SELECT 1 FROM oauth_authorization_codes a WHERE a.client_id = c.id)
        LIMIT ${PURGE_BATCH_SIZE}
      )`
  );

  return { authorizationCodes, tokens, clients };
}
