import type { AuthInfo } from "@modelcontextprotocol/server";
import { withMcpAuth } from "mcp-handler";
import { getAppUrl } from "./app-url";
import { getUserByApiKey } from "./api-keys";
import { oauthProvider, type McpPath } from "./oauth/provider";
import { getUserOrganisation } from "./organisation";

// The one bearer-token authenticator every module's MCP route uses - see
// OAUTH_CONNECTOR_PLAN.md "MCP route changes: one shared authenticator". Routes never call
// mcp-handler's withMcpAuth directly: this wrapper is what guarantees each route answers a
// missing/invalid token with a 401 pointing at *its own* protected resource metadata (the
// only way Claude/ChatGPT discover the OAuth flow) and checks OAuth tokens' audience.

/** Who is calling an MCP route, however they authenticated. */
export interface McpCaller {
  userId: string;
  /** The organisation the call acts for, or null if the user hasn't set one up yet (a non-fatal state each route reports as a tool error). */
  organisationId: string | null;
  via: "api-key" | "oauth";
  /** OAuth only: the grant and client the access token was issued under. */
  grantId?: string;
  oauthClientId?: string;
  /** OAuth only: access token expiry, seconds since epoch. */
  expiresAt?: number;
}

/**
 * Resolves a bearer token presented to one MCP route. An OAuth access token (epx_at_...)
 * must have been issued for exactly this route's resource URL and acts for the
 * organisation its grant was approved for. Anything else is tried as an API key, which
 * acts for the user's (single) organisation as before.
 */
export async function authenticateMcpBearer(token: string, mcpPath: McpPath): Promise<McpCaller | null> {
  const resource = oauthProvider.getResource(mcpPath);
  const oauth = await oauthProvider.verifyAccessToken(token, resource.url);
  if (oauth) {
    return {
      userId: oauth.userId,
      organisationId: oauth.organisationId,
      via: "oauth",
      grantId: oauth.grantId,
      oauthClientId: oauth.clientId,
      expiresAt: oauth.expiresAt,
    };
  }

  const user = await getUserByApiKey(token);
  if (!user) return null;
  const organisation = await getUserOrganisation(user.id);
  return { userId: user.id, organisationId: organisation?.organisationId ?? null, via: "api-key" };
}

/**
 * Wraps an MCP route handler with Epexta's authentication. `buildExtra` turns the caller
 * into the route's own per-request context (entitlements, connections, ...), exposed to
 * tools as `ctx.http.authInfo.extra` and to the handler as `req.auth.extra` - still
 * computed per request, never stored in a token, so access changes apply immediately.
 */
export function withEpextaMcpAuth<TExtra extends Record<string, unknown>>(
  mcpPath: McpPath,
  handler: (req: Request) => Response | Promise<Response>,
  buildExtra: (caller: McpCaller) => Promise<TExtra>,
  logPrefix: string
): (req: Request) => Promise<Response> {
  const resource = oauthProvider.getResource(mcpPath);

  async function verifyToken(_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
    if (!bearerToken) return undefined;
    try {
      const caller = await authenticateMcpBearer(bearerToken, mcpPath);
      if (!caller) {
        console.error(`[${logPrefix}] auth failed: unknown, expired, or revoked token`);
        return undefined;
      }
      return {
        token: bearerToken,
        // An OAuth client_id for OAuth callers; the user id for API keys (unchanged from before OAuth).
        clientId: caller.oauthClientId ?? caller.userId,
        scopes: [],
        expiresAt: caller.expiresAt,
        resource: new URL(resource.url),
        extra: await buildExtra(caller),
      };
    } catch (error) {
      console.error(`[${logPrefix}] auth threw an error:`, error);
      return undefined;
    }
  }

  return withMcpAuth(handler, verifyToken, {
    required: true,
    resourceUrl: getAppUrl(),
    resourceMetadataPath: resource.metadataPath,
  });
}
