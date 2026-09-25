import { OAuthErrorCode, type OAuthMetadata, type OAuthProtectedResourceMetadata } from "@modelcontextprotocol/server";
import { getAppUrl } from "@/lib/app-url";
import { OAUTH_PATHS } from "./config";
import { oauthProvider } from "./provider";
import { OAuthTokenError } from "./tokens";

// The HTTP side of Epexta's authorization server: every non-browser OAuth endpoint, as
// request -> Response handlers that the app/ route files simply export. Parameter parsing
// and error formatting live here; all behaviour comes from oauthProvider (provider.ts).
// (/oauth/authorize is a page, not an endpoint: app/(frontend)/oauth/authorize.)
//
// These are public, credential-less APIs called by browser-based clients too, so CORS is
// wide open with no cookies, and every response is uncacheable (RFC 6749 section 5.1
// requires it for token responses).

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } });
}

function error(code: OAuthErrorCode | string, description: string, status = 400): Response {
  return json({ error: code, error_description: description }, status);
}

/** Maps a thrown error to an RFC 6749 error response; anything unexpected is logged and becomes server_error. */
function failure(caught: unknown, action: string): Response {
  if (caught instanceof OAuthTokenError) return error(caught.code, caught.message);
  console.error(`[oauth] ${action} error:`, caught);
  return error(OAuthErrorCode.ServerError, `Something went wrong ${action}.`, 500);
}

/**
 * Reads an application/x-www-form-urlencoded body (RFC 6749 section 4.1.3 - what Claude
 * and ChatGPT send to the token and revocation endpoints) into single-valued params, or
 * null if the body is another type or repeats a parameter.
 */
async function readFormParams(request: Request): Promise<Map<string, string> | null> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    return null;
  }
  const params = new Map<string, string>();
  for (const [key, value] of new URLSearchParams(await request.text())) {
    if (params.has(key)) return null;
    params.set(key, value);
  }
  return params;
}

/**
 * RFC 8414 authorization server metadata. Every advertised value is enforced elsewhere -
 * e.g. S256 in authorize.ts, public clients in clients.ts. No OpenID Connect fields:
 * Epexta issues no ID tokens, and ChatGPT requests openid/email/profile scopes whenever
 * they're advertised.
 */
function authorizationServerMetadata(): OAuthMetadata & Record<string, unknown> {
  const issuer = getAppUrl();
  return {
    issuer,
    authorization_endpoint: `${issuer}${OAUTH_PATHS.authorize}`,
    token_endpoint: `${issuer}${OAUTH_PATHS.token}`,
    registration_endpoint: `${issuer}${OAUTH_PATHS.register}`,
    revocation_endpoint: `${issuer}${OAUTH_PATHS.revoke}`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    // Claude only selects CIMD when both this and "none" above are advertised.
    client_id_metadata_document_supported: true,
    // RFC 9207: every authorization response carries `iss` (see authorize.ts).
    authorization_response_iss_parameter_supported: true,
  };
}

export const oauthEndpoints = {
  /** OPTIONS for every endpoint below. */
  preflight(): Response {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  },

  /** GET /.well-known/oauth-authorization-server */
  authorizationServerMetadata(): Response {
    return json(authorizationServerMetadata());
  },

  /**
   * GET /.well-known/oauth-protected-resource/<mcpPath> - RFC 9728 metadata for one MCP
   * route, which its 401 points at (lib/mcp-auth.ts). `resource` must equal the URL a user
   * pastes into Claude/ChatGPT exactly, so there is deliberately no root-level document:
   * one document can't name two routes. No `scopes_supported` - Epexta defines no scopes
   * yet, so clients request none.
   */
  protectedResourceMetadata(mcpPath: string): Response {
    const resource = oauthProvider.findResourceByPath(mcpPath);
    if (!resource) return error("not_found", "No MCP server is served at that path.", 404);
    const metadata: OAuthProtectedResourceMetadata = {
      resource: resource.url,
      authorization_servers: [getAppUrl()],
      bearer_methods_supported: ["header"],
      resource_name: `Epexta: ${resource.name}`,
    };
    return json(metadata);
  },

  /** POST /oauth/token - authorization_code (with PKCE) and refresh_token grants, public clients only. */
  async token(request: Request): Promise<Response> {
    const params = await readFormParams(request);
    if (!params) {
      return error(OAuthErrorCode.InvalidRequest, "Send application/x-www-form-urlencoded parameters, each at most once.");
    }
    const clientId = params.get("client_id");
    if (!clientId) return error(OAuthErrorCode.InvalidRequest, "client_id is required.");
    const resource = params.get("resource");

    try {
      switch (params.get("grant_type")) {
        case "authorization_code": {
          const code = params.get("code");
          const redirectUri = params.get("redirect_uri");
          const codeVerifier = params.get("code_verifier");
          if (!code || !redirectUri || !codeVerifier) {
            return error(OAuthErrorCode.InvalidRequest, "code, redirect_uri, and code_verifier are required.");
          }
          return json(await oauthProvider.exchangeAuthorizationCode({ code, clientId, redirectUri, codeVerifier, resource }));
        }
        case "refresh_token": {
          const refreshToken = params.get("refresh_token");
          if (!refreshToken) return error(OAuthErrorCode.InvalidRequest, "refresh_token is required.");
          return json(await oauthProvider.refreshAccessToken({ refreshToken, clientId, resource }));
        }
        default:
          return error(OAuthErrorCode.UnsupportedGrantType, 'grant_type must be "authorization_code" or "refresh_token".');
      }
    } catch (caught) {
      return failure(caught, "issuing tokens");
    }
  },

  /** POST /oauth/register - RFC 7591 Dynamic Client Registration, the fallback for clients without CIMD. */
  async register(request: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return error(OAuthErrorCode.InvalidClientMetadata, "The request body must be a JSON object.");
    }
    try {
      const result = await oauthProvider.registerClient(body);
      return result.ok ? json(result.response, 201) : error(result.error, result.description);
    } catch (caught) {
      return failure(caught, "registering the client");
    }
  },

  /** POST /oauth/revoke - RFC 7009. Revoking either token of a grant revokes the whole grant. */
  async revoke(request: Request): Promise<Response> {
    const params = await readFormParams(request);
    const token = params?.get("token");
    const clientId = params?.get("client_id");
    if (!token || !clientId) {
      return error(OAuthErrorCode.InvalidRequest, "token and client_id are required, form-encoded.");
    }
    try {
      await oauthProvider.revokeToken(token, clientId);
      return new Response(null, { status: 200, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } });
    } catch (caught) {
      return failure(caught, "revoking the token");
    }
  },
};
