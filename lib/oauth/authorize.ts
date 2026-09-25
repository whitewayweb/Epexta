import { OAuthErrorCode } from "@modelcontextprotocol/server";
import { getAppUrl } from "@/lib/app-url";
import { getPayloadClient } from "@/lib/payload";
import { randomSecret, sha256Hex } from "@/lib/secret-hash";
import { logOAuthEvent } from "./audit";
import {
  clientPublisherHost,
  isLoopbackOnlyClient,
  OAuthClientError,
  resolveClient,
  type OAuthClientRecord,
} from "./clients";
import { AUTHORIZATION_CODE_TTL_MS, OAUTH_PATHS, TOKEN_PREFIX } from "./config";
import { findMcpResourceByUrl, type McpResource } from "./resources";
import { isValidS256Challenge, redirectUriMatches } from "./validation";

// The authorization endpoint (/oauth/authorize): validating a request, and the user's
// approve/deny decision on the consent page - see OAUTH_CONNECTOR_PLAN.md "/oauth/authorize".
// The page and its Server Actions each validate the original query independently; the
// actions never trust anything else the form carried.
//
// Ordering is the security property here: until the client and its redirect_uri are
// verified, an error is rendered on Epexta's own page and never redirected anywhere (an
// unverified redirect_uri is exactly how an open redirect happens). Only after that point
// do errors go back to the client, per RFC 6749 section 4.1.2.1.

interface AuthorizationRequest {
  client: OAuthClientRecord;
  redirectUri: string;
  state: string | undefined;
  codeChallenge: string;
  resource: McpResource;
  /** Epexta defines no scopes yet, so a grant's scopes are always empty (see OAUTH_CONNECTOR_PLAN.md "Scopes"). */
  scopes: string[];
}

type Validation =
  | { kind: "ok"; request: AuthorizationRequest }
  /** Rendered on Epexta's page - the redirect_uri can't be trusted (yet). */
  | { kind: "invalid"; message: string }
  /** Sent back to the (verified) client's redirect_uri. */
  | { kind: "redirect"; url: string };

/** What the consent page shows for a valid request. */
export interface ConsentDetails {
  /** The original query, posted back by the approve/deny forms. */
  query: string;
  /** This request's /oauth/authorize URL - for sending the user through login and back. */
  authorizePath: string;
  clientName: string;
  /** See clientPublisherHost - shown alongside the client's self-chosen name. */
  publisherHost: string | null;
  /** Every redirect URI is a loopback address - the app runs on the user's own machine. */
  runsLocally: boolean;
  redirectHost: string;
  resource: McpResource;
}

export type AuthorizationStart = Exclude<Validation, { kind: "ok" }> | { kind: "consent"; consent: ConsentDetails };

/** Who approved a request: the signed-in user and the organisation the grant will act for. */
export interface Grantor {
  userId: string;
  organisationId: string;
}

/** Builds a client redirect carrying the RFC 9207 `iss` parameter on every response, success or error. */
export function authorizationResponseUrl(redirectUri: string, params: Record<string, string | undefined>): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  url.searchParams.set("iss", getAppUrl());
  return url.toString();
}

/** Parses a query into single-valued params; OAuth forbids repeating a parameter (RFC 6749 section 3.1). */
function singleValued(query: URLSearchParams): Map<string, string> | null {
  const params = new Map<string, string>();
  for (const [key, value] of query) {
    if (params.has(key)) return null;
    params.set(key, value);
  }
  return params;
}

export async function validateAuthorizationRequest(query: URLSearchParams): Promise<Validation> {
  const params = singleValued(query);
  if (!params) return { kind: "invalid", message: "The authorization request repeats a parameter." };

  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  if (!clientId) return { kind: "invalid", message: "The authorization request is missing client_id." };
  if (!redirectUri) return { kind: "invalid", message: "The authorization request is missing redirect_uri." };

  let client: OAuthClientRecord;
  try {
    client = await resolveClient(clientId);
  } catch (error) {
    if (error instanceof OAuthClientError) return { kind: "invalid", message: error.message };
    throw error;
  }
  if (!redirectUriMatches(client.redirectUris, redirectUri)) {
    return { kind: "invalid", message: "The redirect_uri is not registered for this app." };
  }

  const state = params.get("state");
  const fail = (error: OAuthErrorCode, description: string): Validation => ({
    kind: "redirect",
    url: authorizationResponseUrl(redirectUri, { error, error_description: description, state }),
  });

  if (params.get("response_type") !== "code") {
    return fail(OAuthErrorCode.UnsupportedResponseType, 'Only response_type "code" is supported.');
  }
  const codeChallenge = params.get("code_challenge");
  if (params.get("code_challenge_method") !== "S256" || !codeChallenge || !isValidS256Challenge(codeChallenge)) {
    return fail(OAuthErrorCode.InvalidRequest, "PKCE with code_challenge_method S256 is required.");
  }
  const resourceParam = params.get("resource");
  if (!resourceParam) {
    return fail(OAuthErrorCode.InvalidTarget, "The resource parameter (the MCP server URL) is required.");
  }
  const resource = findMcpResourceByUrl(resourceParam);
  if (!resource) return fail(OAuthErrorCode.InvalidTarget, "The resource is not an Epexta MCP server.");

  return { kind: "ok", request: { client, redirectUri, state, codeChallenge, resource, scopes: [] } };
}

function authorizePathFor(query: URLSearchParams): string {
  return `${OAUTH_PATHS.authorize}?${query}`;
}

/** Converts a page's searchParams to a query, keeping repeated parameters repeated so validation rejects them. */
function toQuery(searchParams: Record<string, string | string[] | undefined>): URLSearchParams {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  }
  return query;
}

/** Validates an incoming /oauth/authorize request and, if it's valid, describes it for the consent page. */
export async function startAuthorization(
  searchParams: Record<string, string | string[] | undefined>
): Promise<AuthorizationStart> {
  const query = toQuery(searchParams);
  const validation = await validateAuthorizationRequest(query);
  if (validation.kind !== "ok") return validation;

  const { client, redirectUri, resource } = validation.request;
  return {
    kind: "consent",
    consent: {
      query: query.toString(),
      authorizePath: authorizePathFor(query),
      clientName: client.clientName,
      publisherHost: clientPublisherHost(client),
      runsLocally: isLoopbackOnlyClient(client),
      redirectHost: new URL(redirectUri).host,
      resource,
    },
  };
}

/**
 * Stores a single-use authorization code for an approved request and returns the raw code
 * (only its hash is stored). Everything the token exchange needs travels with the code, so
 * the grant itself is only created once a client actually redeems it (tokens.ts).
 */
async function issueAuthorizationCode(request: AuthorizationRequest, grantor: Grantor): Promise<string> {
  const code = randomSecret(TOKEN_PREFIX.code);
  const payload = await getPayloadClient();
  await payload.create({
    collection: "oauth-authorization-codes",
    data: {
      hashedCode: sha256Hex(code),
      client: Number(request.client.id),
      user: Number(grantor.userId),
      organisation: Number(grantor.organisationId),
      resource: request.resource.url,
      scopes: request.scopes,
      redirectUri: request.redirectUri,
      codeChallenge: request.codeChallenge,
      expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_TTL_MS).toISOString(),
    },
    overrideAccess: true,
  });
  return code;
}

/**
 * The user approved: re-validates the posted query and returns where to send them - the
 * client's redirect_uri with a new code, or (for a request that's no longer valid) back
 * to the consent page, which renders the reason. Only a verified client's redirect_uri is
 * ever redirected to.
 */
export async function approveAuthorization(rawQuery: string, grantor: Grantor): Promise<string> {
  const query = new URLSearchParams(rawQuery);
  const validation = await validateAuthorizationRequest(query);
  if (validation.kind === "invalid") return authorizePathFor(query);
  if (validation.kind === "redirect") return validation.url;

  const { request } = validation;
  const code = await issueAuthorizationCode(request, grantor);
  logOAuthEvent("authorization_approved", {
    userId: grantor.userId,
    organisationId: grantor.organisationId,
    clientId: request.client.clientId,
    resource: request.resource.url,
  });
  return authorizationResponseUrl(request.redirectUri, { code, state: request.state });
}

/** The user declined: returns where to send them, like approveAuthorization. */
export async function denyAuthorization(rawQuery: string): Promise<string> {
  const query = new URLSearchParams(rawQuery);
  const validation = await validateAuthorizationRequest(query);
  if (validation.kind === "invalid") return authorizePathFor(query);
  if (validation.kind === "redirect") return validation.url;

  logOAuthEvent("authorization_denied", {
    clientId: validation.request.client.clientId,
    resource: validation.request.resource.url,
  });
  return authorizationResponseUrl(validation.request.redirectUri, {
    error: OAuthErrorCode.AccessDenied,
    error_description: "The user declined to connect this app.",
    state: validation.request.state,
  });
}

/** The /oauth/authorize URL for a raw query - where an unauthenticated approval returns after login. */
export function authorizePathForQuery(rawQuery: string): string {
  return authorizePathFor(new URLSearchParams(rawQuery));
}
