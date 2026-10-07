import { getAppUrl } from "@/lib/app-url";
import { decrypt, encrypt } from "@/lib/crypto";

// Epexta only brokers LinkedIn's OAuth login for the Epexta Social Publisher plugin: it holds
// the app's client secret, exchanges the code, and hands the resulting access token to
// the plugin once. Nothing is stored - `state` and the handoff code are each an
// AES-GCM-sealed, expiring blob (lib/crypto.ts), so there is no collection to clean up.

export const LINKEDIN_SCOPES = ["w_member_social", "w_organization_social", "rw_organization_admin", "r_basicprofile"];

const STATE_TTL_MS = 10 * 60 * 1000;
const HANDOFF_TTL_MS = 2 * 60 * 1000;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} environment variable.`);
  return value;
}

// Both must be registered as Authorized redirect URLs on the LinkedIn app, and the same value
// must be used for the authorization request and the token exchange.
const CALLBACK_PATH = "/api/linkedin/oauth/callback";
const PRODUCTION_REDIRECT_URI = `https://epexta.whitewayweb.com${CALLBACK_PATH}`;
const STAGING_REDIRECT_URI = `https://epexta-git-main-whitewayweb.vercel.app${CALLBACK_PATH}`;

export function redirectUri(): string {
  if (process.env.LINKEDIN_OAUTH_REDIRECT_URI) return process.env.LINKEDIN_OAUTH_REDIRECT_URI;
  if (process.env.VERCEL_ENV === "production") return PRODUCTION_REDIRECT_URI;
  if (process.env.VERCEL_ENV === "preview") return STAGING_REDIRECT_URI;
  return `${getAppUrl()}${CALLBACK_PATH}`;
}

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$|\.(localhost|test|local)$/;

/**
 * The plugin's settings page the browser is sent back to. https only (plain http just for
 * local development hosts) and no embedded credentials; the page shows the host to the
 * user before anything is sent there, and the token can only be redeemed by that origin.
 */
export function parseReturnUrl(raw: unknown): URL | null {
  if (typeof raw !== "string" || raw.length > 2000) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  const local = LOCAL_HOST.test(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
  return url;
}

type Purpose = "state" | "handoff";

function seal(purpose: Purpose, payload: Record<string, unknown>, ttlMs: number): string {
  return encrypt(JSON.stringify({ ...payload, p: purpose, exp: Date.now() + ttlMs }));
}

function unseal<T>(purpose: Purpose, sealed: string): T | null {
  try {
    const parsed = JSON.parse(decrypt(sealed)) as { p?: string; exp?: number } & T;
    if (parsed.p !== purpose || typeof parsed.exp !== "number" || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface StatePayload {
  userId: string;
  returnUrl: string;
}

export function createState(payload: StatePayload): string {
  return seal("state", { ...payload }, STATE_TTL_MS);
}

export function readState(state: string): StatePayload | null {
  return unseal<StatePayload>("state", state);
}

export interface HandoffPayload {
  accessToken: string;
  expiresIn: number;
  scope: string;
  origin: string;
}

export function createHandoff(payload: HandoffPayload): string {
  return seal("handoff", { ...payload }, HANDOFF_TTL_MS);
}

export function readHandoff(code: string): HandoffPayload | null {
  return unseal<HandoffPayload>("handoff", code);
}

export function buildAuthorizationUrl(state: string): string {
  const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", requiredEnv("LINKEDIN_OAUTH_CLIENT_ID"));
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("state", state);
  url.searchParams.set("scope", LINKEDIN_SCOPES.join(" "));
  return url.toString();
}

export type ExchangeResult =
  | { ok: true; accessToken: string; expiresIn: number; scope: string }
  | { ok: false };

/** Never logs or throws with `code` or the response attached - failures are just `{ ok: false }`. */
export async function exchangeCodeForToken(code: string): Promise<ExchangeResult> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    client_id: requiredEnv("LINKEDIN_OAUTH_CLIENT_ID"),
    client_secret: requiredEnv("LINKEDIN_OAUTH_CLIENT_SECRET"),
  });

  try {
    const response = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) return { ok: false };
    const json = await response.json();
    if (typeof json.access_token !== "string") return { ok: false };
    return {
      ok: true,
      accessToken: json.access_token,
      expiresIn: Number(json.expires_in) || 60 * 24 * 60 * 60,
      scope: typeof json.scope === "string" ? json.scope : "",
    };
  } catch {
    return { ok: false };
  }
}
