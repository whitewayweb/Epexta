import type { AuthorizationStart, Grantor } from "./authorize";
import { approveAuthorization, denyAuthorization, startAuthorization } from "./authorize";
import { registerDynamicClient, type DynamicRegistrationResult } from "./clients";
import { findMcpResourceByPath, getMcpResource, listMcpResources, type McpPath, type McpResource } from "./resources";
import {
  disconnectApp,
  disconnectOrganisationApp,
  exchangeAuthorizationCode,
  listConnectedApps,
  listOrganisationConnectedApps,
  purgeExpiredOAuthRecords,
  refreshAccessToken,
  revokeTokenForClient,
  verifyAccessToken,
  type CodeExchangeInput,
  type ConnectedApp,
  type OAuthCleanupResult,
  type RefreshInput,
  type TokenResponse,
  type VerifiedAccessToken,
} from "./tokens";

// Epexta's OAuth authorization server, as one provider - the only way code outside
// lib/oauth/ reaches it (the /oauth/* and /.well-known/* route handlers go through
// endpoints.ts, which calls this too). Its shape follows the MCP SDK's OAuthServerProvider,
// plus the Epexta-specific parts (consent, connected apps, housekeeping). Everything behind
// it - clients.ts, authorize.ts, tokens.ts - is an implementation detail; replacing it with
// a hosted authorization server would mean re-implementing this interface, nothing else.
// See OAUTH_CONNECTOR_PLAN.md.

export interface OAuthProvider {
  // --- Protected resources: one per distinct MCP route (resources.ts) ---
  listResources(): McpResource[];
  getResource(mcpPath: McpPath): McpResource;
  findResourceByPath(path: string): McpResource | undefined;

  // --- Authorization endpoint: the /oauth/authorize consent page and its Server Actions ---
  /** Validates an incoming request; a valid one comes back described for the consent page. */
  startAuthorization(searchParams: Record<string, string | string[] | undefined>): Promise<AuthorizationStart>;
  /** Re-validates the posted query and returns the URL to redirect the user to (a code, or an error). */
  approveAuthorization(query: string, grantor: Grantor): Promise<string>;
  denyAuthorization(query: string): Promise<string>;

  // --- Client registration (/oauth/register, RFC 7591) ---
  registerClient(body: unknown): Promise<DynamicRegistrationResult>;

  // --- Token endpoint (/oauth/token) and revocation (/oauth/revoke, RFC 7009) ---
  // These throw OAuthTokenError for a client-facing RFC 6749 error.
  exchangeAuthorizationCode(input: CodeExchangeInput): Promise<TokenResponse>;
  refreshAccessToken(input: RefreshInput): Promise<TokenResponse>;
  revokeToken(token: string, clientId: string): Promise<void>;

  // --- Resource server: every MCP request (lib/mcp-auth.ts) ---
  /** Null unless the token is valid, unexpired, issued for exactly this resource URL, and its grant still active. */
  verifyAccessToken(token: string, resourceUrl: string): Promise<VerifiedAccessToken | null>;

  // --- Connected apps (/settings/connected-apps) ---
  /** The user's own live connections (grants grouped per app and connector). */
  listConnectedApps(userId: string): Promise<ConnectedApp[]>;
  /** Revokes every grant in one of the user's own connections. False if it isn't theirs. */
  disconnectApp(userId: string, connectionId: string): Promise<boolean>;
  /** Every member's live connections; null unless `actorUserId` is an admin of the organisation. */
  listOrganisationConnectedApps(actorUserId: string, organisationId: string): Promise<ConnectedApp[] | null>;
  /** An organisation admin disconnecting any member's connection. False if not allowed or not found. */
  disconnectOrganisationApp(actorUserId: string, organisationId: string, connectionId: string): Promise<boolean>;

  // --- Housekeeping (/api/cron/oauth-cleanup) ---
  purgeExpiredRecords(now?: Date): Promise<OAuthCleanupResult>;
}

export const oauthProvider: OAuthProvider = {
  listResources: listMcpResources,
  getResource: getMcpResource,
  findResourceByPath: findMcpResourceByPath,

  startAuthorization,
  approveAuthorization,
  denyAuthorization,

  registerClient: registerDynamicClient,

  exchangeAuthorizationCode,
  refreshAccessToken: (input) => refreshAccessToken(input),
  revokeToken: revokeTokenForClient,

  verifyAccessToken,

  listConnectedApps,
  disconnectApp,
  listOrganisationConnectedApps,
  disconnectOrganisationApp,

  purgeExpiredRecords: purgeExpiredOAuthRecords,
};

export type { ConnectedApp, McpPath, McpResource };
