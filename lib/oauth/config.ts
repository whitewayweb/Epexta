// Single source of truth for Epexta's OAuth authorization server's fixed parameters - the
// discovery metadata (endpoints.ts), the endpoints that enforce these values, and tests all
// read from here, so an advertised capability and its enforcement can't drift apart.
// See OAUTH_CONNECTOR_PLAN.md.

export const OAUTH_PATHS = {
  authorize: "/oauth/authorize",
  token: "/oauth/token",
  register: "/oauth/register",
  revoke: "/oauth/revoke",
} as const;

/** Authorization codes are exchanged immediately by the client; 60s covers network latency only. */
export const AUTHORIZATION_CODE_TTL_MS = 60 * 1000;
/**
 * Short-lived so a leaked access token has bounded value (MCP spec SHOULD). Revocation is
 * still immediate regardless - every request re-checks the grant (lib/oauth/tokens.ts).
 */
export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
/** A refresh token lapses after this long unused... */
export const REFRESH_TOKEN_IDLE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** ...and no refresh token outlives its grant's creation by more than this; the user re-consents. */
export const GRANT_MAX_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;
/** Throttle for the "last used" bookkeeping write on the grant (one write per window, not per request). */
export const GRANT_LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000;

/** Opaque token type prefixes - lets lib/mcp-auth.ts route a bearer token to one lookup, not two. */
export const TOKEN_PREFIX = {
  access: "epx_at_",
  refresh: "epx_rt_",
  code: "epx_ac_",
  dcrClientId: "epx_client_",
} as const;

// Client ID Metadata Document fetch limits. Claude waits up to 10s for the whole
// authorization-server round trip, so the fetch must finish well inside that.
export const CIMD_FETCH_TIMEOUT_MS = 5 * 1000;
export const CIMD_MAX_BYTES = 5 * 1024;
export const CIMD_CACHE_MIN_MS = 5 * 60 * 1000;
export const CIMD_CACHE_MAX_MS = 24 * 60 * 60 * 1000;

export const MAX_REDIRECT_URIS = 10;
export const MAX_CLIENT_NAME_LENGTH = 100;

/** DCR/CIMD client records with no grants that haven't been used for this long are pruned. */
export const UNUSED_CLIENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
/** Expired codes/tokens are kept this long past expiry (debugging window), then pruned. */
export const EXPIRED_RECORD_RETENTION_MS = 24 * 60 * 60 * 1000;
