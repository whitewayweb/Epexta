import { z } from "zod";
import { getPayloadClient } from "@/lib/payload";
import { randomSecret } from "@/lib/secret-hash";
import type { OauthClient } from "@/payload-types";
import { logOAuthEvent } from "./audit";
import {
  CIMD_CACHE_MAX_MS,
  CIMD_CACHE_MIN_MS,
  CIMD_FETCH_TIMEOUT_MS,
  CIMD_MAX_BYTES,
  MAX_CLIENT_NAME_LENGTH,
  MAX_REDIRECT_URIS,
  TOKEN_PREFIX,
} from "./config";
import { isAllowedRedirectUri, isLoopbackRedirectUri } from "./validation";
import { fetchPublicJson, type SafeFetchOptions } from "./safe-fetch";

// How Epexta's authorization server learns who a client is - see OAUTH_CONNECTOR_PLAN.md
// "Client registration". Two mechanisms, in the MCP spec's order of preference:
//
// 1. Client ID Metadata Documents (CIMD): the client_id *is* an https URL serving the
//    client's metadata. Claude Code and ChatGPT use this. Fetched on first use, cached in
//    oauth-clients, refetched once the cache expires.
// 2. Dynamic Client Registration (DCR, RFC 7591): the client POSTs its metadata to
//    /oauth/register and gets back a generated client_id. Deprecated by the spec but kept
//    as the fallback for clients that don't do CIMD yet.
//
// Either way every client is public: token_endpoint_auth_method is always "none", and
// PKCE (not a client secret) proves the token request came from whoever started the
// authorization. A CIMD document declaring another method (ChatGPT's declares
// private_key_jwt but lists "none" as supported) is still accepted - the client picks
// "none" from our advertised token_endpoint_auth_methods_supported.

export interface OAuthClientRecord {
  /** Payload document id - what codes/grants reference. */
  id: string;
  clientId: string;
  registrationType: "cimd" | "dcr";
  clientName: string;
  clientUri: string | null;
  redirectUris: string[];
}

/** A client that can't be resolved or is invalid. Its message is safe to show the user. */
export class OAuthClientError extends Error {}

function toRecord(doc: OauthClient): OAuthClientRecord {
  return {
    id: String(doc.id),
    clientId: doc.clientId,
    registrationType: doc.registrationType,
    clientName: doc.clientName,
    clientUri: doc.clientUri ?? null,
    redirectUris: Array.isArray(doc.redirectUris) ? doc.redirectUris.map(String) : [],
  };
}

/** A CIMD client_id: an https URL with a path component (per the CIMD draft and MCP spec). */
export function isCimdClientId(clientId: string): boolean {
  try {
    const url = new URL(clientId);
    return url.protocol === "https:" && url.pathname !== "/" && !url.hash;
  } catch {
    return false;
  }
}

const redirectUrisSchema = z
  .array(z.string())
  .min(1, "redirect_uris must list at least one URI.")
  .max(MAX_REDIRECT_URIS, `redirect_uris may list at most ${MAX_REDIRECT_URIS} URIs.`)
  .refine((uris) => uris.every(isAllowedRedirectUri), "Every redirect URI must be https, or http on a loopback address.");

const clientNameSchema = z.string().trim().min(1).max(MAX_CLIENT_NAME_LENGTH);
const optionalHttpsUrl = z
  .string()
  .url()
  .refine((value) => value.startsWith("https://"))
  .optional()
  .catch(undefined);

const cimdDocumentSchema = z.object({
  client_id: z.string(),
  client_name: clientNameSchema,
  client_uri: optionalHttpsUrl,
  redirect_uris: redirectUrisSchema,
});

async function findClientDoc(clientId: string): Promise<OauthClient | null> {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "oauth-clients",
    where: { clientId: { equals: clientId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return result.docs[0] ?? null;
}

type ClientData = Pick<OauthClient, "clientName" | "clientUri" | "redirectUris" | "metadataExpiresAt">;

/**
 * Creates or refreshes the oauth-clients row for a client_id. A concurrent first-use of the
 * same CIMD client can race to create it; clientId's unique index rejects the loser, which
 * then updates the winner's row instead.
 */
async function upsertClient(
  clientId: string,
  registrationType: OauthClient["registrationType"],
  data: ClientData
): Promise<OauthClient> {
  const payload = await getPayloadClient();
  const existing = await findClientDoc(clientId);
  if (existing) {
    return payload.update({ collection: "oauth-clients", id: existing.id, data, overrideAccess: true });
  }
  try {
    return await payload.create({
      collection: "oauth-clients",
      data: { clientId, registrationType, ...data },
      overrideAccess: true,
    });
  } catch (error) {
    const winner = await findClientDoc(clientId);
    if (!winner) throw error;
    return payload.update({ collection: "oauth-clients", id: winner.id, data, overrideAccess: true });
  }
}

function clampCacheMs(maxAgeMs: number | null): number {
  if (maxAgeMs === null) return CIMD_CACHE_MIN_MS;
  return Math.min(Math.max(maxAgeMs, CIMD_CACHE_MIN_MS), CIMD_CACHE_MAX_MS);
}

async function fetchCimdClient(clientId: string, fetchOptions?: Partial<SafeFetchOptions>): Promise<OauthClient> {
  let fetched;
  try {
    fetched = await fetchPublicJson(new URL(clientId), {
      timeoutMs: CIMD_FETCH_TIMEOUT_MS,
      maxBytes: CIMD_MAX_BYTES,
      ...fetchOptions,
    });
  } catch (error) {
    logOAuthEvent("client_rejected", { clientId, reason: "fetch_failed", detail: String(error) });
    throw new OAuthClientError("This app's client metadata document could not be retrieved.");
  }

  const parsed = cimdDocumentSchema.safeParse(fetched.body);
  if (!parsed.success) {
    const detail = parsed.error.issues[0]?.message;
    logOAuthEvent("client_rejected", { clientId, reason: "invalid_document", detail });
    throw new OAuthClientError(`This app's client metadata document is invalid: ${detail}`);
  }
  if (parsed.data.client_id !== clientId) {
    logOAuthEvent("client_rejected", { clientId, reason: "client_id_mismatch" });
    throw new OAuthClientError("This app's client metadata document does not match its client_id.");
  }

  return upsertClient(clientId, "cimd", {
    clientName: parsed.data.client_name,
    clientUri: parsed.data.client_uri ?? null,
    redirectUris: parsed.data.redirect_uris,
    metadataExpiresAt: new Date(Date.now() + clampCacheMs(fetched.maxAgeMs)).toISOString(),
  });
}

/**
 * Resolves a client_id from an authorization request to a known, valid client - fetching
 * (or refetching an expired) CIMD document, or looking up a DCR registration.
 * `fetchOptions` is injectable for tests only.
 */
export async function resolveClient(
  clientId: string,
  fetchOptions?: Partial<SafeFetchOptions>
): Promise<OAuthClientRecord> {
  if (isCimdClientId(clientId)) {
    const cached = await findClientDoc(clientId);
    if (
      cached?.registrationType === "cimd" &&
      cached.metadataExpiresAt &&
      new Date(cached.metadataExpiresAt).getTime() > Date.now()
    ) {
      return toRecord(cached);
    }
    return toRecord(await fetchCimdClient(clientId, fetchOptions));
  }

  const doc = clientId.startsWith(TOKEN_PREFIX.dcrClientId) ? await findClientDoc(clientId) : null;
  if (!doc || doc.registrationType !== "dcr") {
    throw new OAuthClientError("Unknown client_id.");
  }
  return toRecord(doc);
}

/**
 * Looks up an already-known client without any network fetch - for the token and
 * revocation endpoints, which only ever see a client_id that /oauth/authorize resolved.
 */
export async function findKnownClient(clientId: string): Promise<OAuthClientRecord | null> {
  const doc = await findClientDoc(clientId);
  return doc ? toRecord(doc) : null;
}

/** Records that a client just completed an authorization or token exchange (drives pruning). */
export async function touchClient(clientDocId: string): Promise<void> {
  const payload = await getPayloadClient();
  await payload.update({
    collection: "oauth-clients",
    id: clientDocId,
    data: { lastUsedAt: new Date().toISOString() },
    overrideAccess: true,
  });
}

/**
 * The host that vouches for a client's identity: for CIMD, the host serving its metadata
 * document (e.g. "claude.ai" - only that host could have published it); for DCR, only the
 * self-declared client_uri. Shown next to the client's self-chosen name, which on its own
 * proves nothing.
 */
export function clientPublisherHost(client: Pick<OAuthClientRecord, "registrationType" | "clientId" | "clientUri">): string | null {
  const source = client.registrationType === "cimd" ? client.clientId : client.clientUri;
  if (!source) return null;
  try {
    return new URL(source).host;
  } catch {
    return null;
  }
}

/** Whether every redirect URI is a loopback address - i.e. the app runs on the user's own machine. */
export function isLoopbackOnlyClient(client: OAuthClientRecord): boolean {
  return client.redirectUris.length > 0 && client.redirectUris.every(isLoopbackRedirectUri);
}

const dcrRequestSchema = z.object({
  redirect_uris: redirectUrisSchema,
  client_name: clientNameSchema.optional().catch(undefined),
  client_uri: optionalHttpsUrl,
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
});

export type DynamicRegistrationResult =
  | { ok: true; response: Record<string, unknown> }
  | { ok: false; error: "invalid_redirect_uri" | "invalid_client_metadata"; description: string };

/**
 * RFC 7591 registration. The server decides the final metadata: every client is public
 * (token_endpoint_auth_method "none", no secret issued) and may only use the grants this
 * server supports, whatever the request asked for - RFC 7591 section 3.2.1 lets the
 * server replace requested values and report what it actually registered.
 */
export async function registerDynamicClient(body: unknown): Promise<DynamicRegistrationResult> {
  const parsed = dcrRequestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.path[0] === "redirect_uris" ? "invalid_redirect_uri" : "invalid_client_metadata",
      description: issue?.message ?? "Invalid client metadata.",
    };
  }
  if (parsed.data.response_types && parsed.data.response_types.some((type) => type !== "code")) {
    return { ok: false, error: "invalid_client_metadata", description: 'Only response_type "code" is supported.' };
  }

  const clientId = randomSecret(TOKEN_PREFIX.dcrClientId, 16);
  const clientName = parsed.data.client_name ?? "Unnamed app";
  const doc = await upsertClient(clientId, "dcr", {
    clientName,
    clientUri: parsed.data.client_uri ?? null,
    redirectUris: parsed.data.redirect_uris,
    metadataExpiresAt: null,
  });
  logOAuthEvent("client_registered", { clientId, clientName, clientUri: parsed.data.client_uri });

  return {
    ok: true,
    response: {
      client_id: clientId,
      client_id_issued_at: Math.floor(new Date(doc.createdAt).getTime() / 1000),
      client_name: clientName,
      ...(parsed.data.client_uri ? { client_uri: parsed.data.client_uri } : {}),
      redirect_uris: parsed.data.redirect_uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
  };
}
