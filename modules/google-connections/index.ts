import { getPayloadClient } from "../../lib/payload";
import { getUserOrganisation } from "../../lib/organisation";
import { isRequestAllowlisted, type HttpMethod } from "./allowlist";
import { CAPABILITY_SCOPES, type GoogleCapability } from "./capabilities";
import { buildAuthorizationUrl, exchangeCodeForTokens, generatePkce, generateState, refreshAccessToken } from "./oauth";
import { getConnectionLifecycleHooks } from "./registry";
import type { GoogleConnection, GoogleOauthState } from "../../payload-types";

const STATE_TTL_MS = 10 * 60 * 1000;
// Refresh a bit before actual expiry so a request in flight never races token expiry.
const REFRESH_SAFETY_MARGIN_MS = 60 * 1000;

export type OauthFlow = { type: "connect" } | { type: "reconnect"; connectionId: string };

export interface PublicConnection {
  id: string;
  googleAccountLabel: string;
  status: "active" | "needs_reconnect" | "revoked";
  lastValidatedAt: string | null;
}

function toPublicConnection(doc: GoogleConnection): PublicConnection {
  return {
    id: String(doc.id),
    googleAccountLabel: doc.googleAccountLabel,
    status: doc.status,
    lastValidatedAt: doc.lastValidatedAt ?? null,
  };
}

async function requireOrganisationAdmin(userId: string, organisationId: string): Promise<void> {
  const membership = await getUserOrganisation(userId);
  if (!membership || membership.organisationId !== organisationId || membership.role !== "admin") {
    throw new Error("Only an organisation admin can manage Google connections.");
  }
}

export async function startAuthorization(
  userId: string,
  organisationId: string,
  capability: GoogleCapability,
  flow: OauthFlow
): Promise<{ authorizationUrl: string; stateToken: string }> {
  await requireOrganisationAdmin(userId, organisationId);

  if (flow.type === "reconnect") {
    const payload = await getPayloadClient();
    const existing = await payload.findByID({
      collection: "google-connections",
      id: flow.connectionId,
      depth: 0,
      overrideAccess: true,
    });
    if (String(existing.organisation) !== organisationId || existing.scopeProfile !== capability) {
      throw new Error("Connection not found for this organisation/capability.");
    }
  }

  const state = generateState();
  const { codeVerifier, codeChallenge } = generatePkce();

  const payload = await getPayloadClient();
  await payload.create({
    collection: "google-oauth-states",
    data: {
      state,
      codeVerifier,
      user: Number(userId),
      organisation: Number(organisationId),
      capability,
      flow,
      expiresAt: new Date(Date.now() + STATE_TTL_MS).toISOString(),
    },
    overrideAccess: true,
  });

  const authorizationUrl = buildAuthorizationUrl({ scope: CAPABILITY_SCOPES[capability], state, codeChallenge });
  return { authorizationUrl, stateToken: state };
}

export type CallbackResult =
  | { status: "connected"; connectionId: string; capability: GoogleCapability }
  | { status: "denied"; capability: GoogleCapability }
  | { status: "error"; reason: string; capability: GoogleCapability | null };

async function consumeState(stateToken: string): Promise<GoogleOauthState | null> {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "google-oauth-states",
    where: { state: { equals: stateToken } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const doc = result.docs[0];
  if (!doc) return null;

  // Delete-on-read makes the state single-use regardless of what happens next -
  // a reused or replayed state token can never reach this point twice.
  await payload.delete({ collection: "google-oauth-states", id: doc.id, overrideAccess: true }).catch(() => {});

  if (new Date(doc.expiresAt).getTime() < Date.now()) return null;
  return doc;
}

/**
 * `currentUserId` is the session user making this callback request right now (or null
 * for an anonymous request) - see "State parameter" under OAuth mechanics in
 * GOOGLE_PERFORMANCE_PLAN.md: handleCallback must verify the current session's user
 * still matches the one startAuthorization recorded, not just that the state token
 * itself is well-formed and unexpired.
 */
export async function handleCallback(
  stateToken: string,
  callbackParams: { code?: string; error?: string; error_description?: string },
  currentUserId: string | null
): Promise<CallbackResult> {
  const stateDoc = await consumeState(stateToken);
  if (!stateDoc) return { status: "error", reason: "invalid_or_expired_state", capability: null };

  const capability = stateDoc.capability as GoogleCapability;

  if (!currentUserId || String(stateDoc.user) !== currentUserId) {
    return { status: "error", reason: "session_mismatch", capability };
  }

  if (callbackParams.error) return { status: "denied", capability };
  if (!callbackParams.code) return { status: "error", reason: "missing_code", capability };

  const exchange = await exchangeCodeForTokens(callbackParams.code, stateDoc.codeVerifier);
  if (!exchange.ok) return { status: "error", reason: exchange.reason, capability };

  const expectedScope = CAPABILITY_SCOPES[capability];
  const grantedScopes = exchange.result.grantedScopes;

  // Stricter than "the required scope is present" - see "Scope isolation" in
  // GOOGLE_PERFORMANCE_PLAN.md. A grant broader than the profile allows is rejected
  // outright rather than persisted, so scopeProfile stays a true, checkable ceiling.
  if (grantedScopes.length !== 1 || grantedScopes[0] !== expectedScope) {
    return { status: "error", reason: "unexpected_scope_grant", capability };
  }

  const payload = await getPayloadClient();
  const organisationId = String(stateDoc.organisation);
  const tokenExpiresAt = new Date(Date.now() + exchange.result.expiresInSeconds * 1000).toISOString();
  const flow = stateDoc.flow as OauthFlow;

  if (flow.type === "connect") {
    const doc = await payload.create({
      collection: "google-connections",
      data: {
        organisation: Number(organisationId),
        googleAccountLabel: "Google account",
        accessToken: exchange.result.accessToken,
        refreshToken: exchange.result.refreshToken ?? "",
        grantedScopes,
        scopeProfile: capability,
        tokenExpiresAt,
        status: "active",
        lastValidatedAt: new Date().toISOString(),
      },
      overrideAccess: true,
    });
    return { status: "connected", connectionId: String(doc.id), capability };
  }

  // Reconnect: update the existing row rather than create a new one.
  const existing = await payload.findByID({
    collection: "google-connections",
    id: flow.connectionId,
    depth: 0,
    overrideAccess: true,
  });
  if (String(existing.organisation) !== organisationId || existing.scopeProfile !== capability) {
    return { status: "error", reason: "connection_mismatch", capability };
  }

  // Google only returns a refresh token on the first grant unless the caller
  // explicitly forces it (which buildAuthorizationUrl always does) - but if it's
  // still absent for some reason, keep the existing one rather than overwrite it
  // with nothing. See "Refresh rotation" in GOOGLE_PERFORMANCE_PLAN.md.
  const refreshTokenUpdate = exchange.result.refreshToken ? { refreshToken: exchange.result.refreshToken } : {};

  await payload.update({
    collection: "google-connections",
    id: flow.connectionId,
    data: {
      accessToken: exchange.result.accessToken,
      ...refreshTokenUpdate,
      tokenExpiresAt,
      status: "active",
      lastValidatedAt: new Date().toISOString(),
    },
    overrideAccess: true,
  });
  return { status: "connected", connectionId: flow.connectionId, capability };
}

export async function getConnectionForCapability(
  organisationId: string,
  connectionId: string,
  capability: GoogleCapability
): Promise<PublicConnection | null> {
  const payload = await getPayloadClient();
  const doc = await payload
    .findByID({ collection: "google-connections", id: connectionId, depth: 0, overrideAccess: true })
    .catch(() => null);
  if (!doc || String(doc.organisation) !== organisationId || doc.scopeProfile !== capability) return null;
  return toPublicConnection(doc);
}

export async function listConnectionsForCapability(
  organisationId: string,
  capability: GoogleCapability
): Promise<PublicConnection[]> {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "google-connections",
    where: { organisation: { equals: organisationId }, scopeProfile: { equals: capability } },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  });
  return result.docs.map(toPublicConnection);
}

export interface ApiRequest {
  method: HttpMethod;
  url: string;
  query?: Record<string, string>;
  body?: unknown;
}

export type ApiRequestResult =
  | { status: "ok"; data: unknown }
  | {
      status: "error";
      reason: "not_found" | "capability_mismatch" | "not_allowlisted" | "revoked" | "needs_reconnect" | "forbidden" | "temporary_failure" | "upstream_error";
    };

async function ensureFreshAccessToken(doc: GoogleConnection): Promise<{ ok: true; accessToken: string } | { ok: false }> {
  const payload = await getPayloadClient();
  const expiresAt = doc.tokenExpiresAt ? new Date(doc.tokenExpiresAt).getTime() : 0;
  if (expiresAt - REFRESH_SAFETY_MARGIN_MS > Date.now()) {
    return { ok: true, accessToken: doc.accessToken ?? "" };
  }

  const refreshed = await refreshAccessToken(doc.refreshToken ?? "");
  if (!refreshed.ok) {
    if (refreshed.reason === "invalid_grant") {
      await payload
        .update({ collection: "google-connections", id: doc.id, data: { status: "needs_reconnect" }, overrideAccess: true })
        .catch(() => {});
    }
    return { ok: false };
  }

  const tokenExpiresAt = new Date(Date.now() + refreshed.result.expiresInSeconds * 1000).toISOString();
  await payload.update({
    collection: "google-connections",
    id: doc.id,
    data: { accessToken: refreshed.result.accessToken, tokenExpiresAt, lastValidatedAt: new Date().toISOString() },
    overrideAccess: true,
  });
  return { ok: true, accessToken: refreshed.result.accessToken };
}

/**
 * Performs the entire outbound Google API call itself - the consuming module supplies
 * only a plain request description and receives only the response. See "Public
 * interface both modules use" in GOOGLE_PERFORMANCE_PLAN.md for why: no consuming
 * module's code is ever given the token, in any form, at any point.
 */
export async function executeGoogleApiRequest(
  connectionId: string,
  capability: GoogleCapability,
  request: ApiRequest
): Promise<ApiRequestResult> {
  if (!isRequestAllowlisted(capability, request.method, request.url)) {
    return { status: "error", reason: "not_allowlisted" };
  }

  const payload = await getPayloadClient();
  const doc = await payload
    .findByID({ collection: "google-connections", id: connectionId, depth: 0, overrideAccess: true })
    .catch(() => null);
  if (!doc) return { status: "error", reason: "not_found" };
  if (doc.scopeProfile !== capability) return { status: "error", reason: "capability_mismatch" };
  if (doc.status === "revoked") return { status: "error", reason: "revoked" };
  if (doc.status === "needs_reconnect") return { status: "error", reason: "needs_reconnect" };

  const fresh = await ensureFreshAccessToken(doc);
  if (!fresh.ok) return { status: "error", reason: "needs_reconnect" };

  const url = new URL(request.url);
  if (request.query) {
    for (const [key, value] of Object.entries(request.query)) url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: request.method,
      headers: {
        Authorization: `Bearer ${fresh.accessToken}`,
        ...(request.body ? { "Content-Type": "application/json" } : {}),
      },
      body: request.body ? JSON.stringify(request.body) : undefined,
    });
  } catch {
    return { status: "error", reason: "temporary_failure" };
  }

  if (response.status === 403) return { status: "error", reason: "forbidden" };
  if (response.status === 429 || response.status >= 500) return { status: "error", reason: "temporary_failure" };
  if (!response.ok) return { status: "error", reason: "upstream_error" };

  const data = await response.json().catch(() => null);
  return { status: "ok", data };
}

export async function revokeConnection(organisationId: string, connectionId: string, actingUserId: string): Promise<void> {
  await requireOrganisationAdmin(actingUserId, organisationId);
  const payload = await getPayloadClient();
  const doc = await payload.findByID({ collection: "google-connections", id: connectionId, depth: 0, overrideAccess: true });
  if (String(doc.organisation) !== organisationId) throw new Error("Connection not found for this organisation.");

  await payload.update({
    collection: "google-connections",
    id: connectionId,
    data: { status: "revoked" },
    overrideAccess: true,
  });

  const hooks = getConnectionLifecycleHooks(doc.scopeProfile as GoogleCapability);
  await hooks?.markMappingsNeedingReconnect(connectionId);
}

export type DisconnectOrDeleteResult = { status: "deleted" } | { status: "revoked"; reason: "referenced_by_mapping" };

export async function disconnectOrDelete(
  organisationId: string,
  connectionId: string,
  actingUserId: string
): Promise<DisconnectOrDeleteResult> {
  await requireOrganisationAdmin(actingUserId, organisationId);
  const payload = await getPayloadClient();
  const doc = await payload.findByID({ collection: "google-connections", id: connectionId, depth: 0, overrideAccess: true });
  if (String(doc.organisation) !== organisationId) throw new Error("Connection not found for this organisation.");

  const hooks = getConnectionLifecycleHooks(doc.scopeProfile as GoogleCapability);
  const isReferenced = (await hooks?.isConnectionReferenced(connectionId)) ?? false;

  if (isReferenced) {
    await revokeConnection(organisationId, connectionId, actingUserId);
    return { status: "revoked", reason: "referenced_by_mapping" };
  }

  await payload.delete({ collection: "google-connections", id: connectionId, overrideAccess: true });
  return { status: "deleted" };
}
