import crypto from "crypto";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} environment variable.`);
  return value;
}

function clientId(): string {
  return requiredEnv("GOOGLE_OAUTH_CLIENT_ID");
}
function clientSecret(): string {
  return requiredEnv("GOOGLE_OAUTH_CLIENT_SECRET");
}
function redirectUri(): string {
  return requiredEnv("GOOGLE_OAUTH_REDIRECT_URI");
}

export function generateState(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function generatePkce(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function buildAuthorizationUrl(params: { scope: string; state: string; codeChallenge: string }): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId());
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", params.scope);
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  // Forced on every authorization request, not just the first - see "Refresh rotation"
  // in GOOGLE_PERFORMANCE_PLAN.md. Without this, Google only returns a refresh token on
  // the very first consent grant for a given client/user/scope combination, so a
  // reconnect flow could silently end up with no new refresh token at all.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

export interface TokenExchangeResult {
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number;
  grantedScopes: string[];
}

export type TokenExchangeError = { ok: false; reason: "network_error" | "invalid_grant" | "upstream_error" };

async function postTokenEndpoint(body: URLSearchParams): Promise<Response> {
  return fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

/**
 * Exchanges an authorization code for tokens. Never logs `code`, `codeVerifier`, or
 * any field of the response - see "Token logging" in GOOGLE_PERFORMANCE_PLAN.md. Errors
 * are returned as typed results, never thrown with the request body attached, so a
 * caller can't accidentally end up logging a caught error that embeds the code/tokens.
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string
): Promise<{ ok: true; result: TokenExchangeResult } | TokenExchangeError> {
  const body = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri(),
  });

  let response: Response;
  try {
    response = await postTokenEndpoint(body);
  } catch {
    return { ok: false, reason: "network_error" };
  }

  if (!response.ok) {
    let errorCode: string | undefined;
    try {
      errorCode = (await response.json())?.error;
    } catch {
      // ignore - fall through to upstream_error below
    }
    return { ok: false, reason: errorCode === "invalid_grant" ? "invalid_grant" : "upstream_error" };
  }

  const json = await response.json();
  return {
    ok: true,
    result: {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? null,
      expiresInSeconds: json.expires_in,
      grantedScopes: typeof json.scope === "string" ? json.scope.split(" ").filter(Boolean) : [],
    },
  };
}

export interface TokenRefreshResult {
  accessToken: string;
  expiresInSeconds: number;
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<{ ok: true; result: TokenRefreshResult } | TokenExchangeError> {
  const body = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  let response: Response;
  try {
    response = await postTokenEndpoint(body);
  } catch {
    return { ok: false, reason: "network_error" };
  }

  if (!response.ok) {
    let errorCode: string | undefined;
    try {
      errorCode = (await response.json())?.error;
    } catch {
      // ignore - fall through to upstream_error below
    }
    return { ok: false, reason: errorCode === "invalid_grant" ? "invalid_grant" : "upstream_error" };
  }

  const json = await response.json();
  return { ok: true, result: { accessToken: json.access_token, expiresInSeconds: json.expires_in } };
}
