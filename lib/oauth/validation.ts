import crypto from "crypto";

// The two pure checks every authorization request goes through: redirect URI matching and
// PKCE. No I/O here - clients.ts, authorize.ts, and tokens.ts apply them.

// --- Redirect URIs ---------------------------------------------------------------------
//
// Exact matching is the core defence against open redirects and code theft (MCP spec "Open
// Redirection"); the single, spec-sanctioned exception is the port of a loopback redirect,
// which native clients like Claude Code pick at random per session (RFC 8252 section 7.3).

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "[::1]", "localhost"]);

function parse(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export function isLoopbackRedirectUri(raw: string): boolean {
  const url = parse(raw);
  return url !== null && url.protocol === "http:" && LOOPBACK_HOSTNAMES.has(url.hostname);
}

/**
 * Whether a client may register this redirect URI at all: absolute, no fragment, no
 * embedded credentials, and either https or an http loopback address (MCP spec
 * "Communication Security": redirect URIs MUST be localhost or HTTPS).
 */
export function isAllowedRedirectUri(raw: string): boolean {
  const url = parse(raw);
  if (!url || url.hash || url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  return isLoopbackRedirectUri(raw);
}

/**
 * Whether a requested redirect_uri matches one of the client's registered ones. Exact
 * string match, except that for a registered http loopback URI the port is ignored (and
 * only the port - scheme, host, path, and query must still be identical). `localhost` and
 * `127.0.0.1` are distinct hosts here: each must be registered to be accepted.
 */
export function redirectUriMatches(registered: readonly string[], requested: string): boolean {
  if (registered.includes(requested)) return true;
  if (!isLoopbackRedirectUri(requested)) return false;

  const requestedUrl = parse(requested)!;
  return registered.some((candidate) => {
    if (!isLoopbackRedirectUri(candidate)) return false;
    const registeredUrl = parse(candidate)!;
    return (
      registeredUrl.hostname === requestedUrl.hostname &&
      registeredUrl.pathname === requestedUrl.pathname &&
      registeredUrl.search === requestedUrl.search &&
      !requestedUrl.hash
    );
  });
}

// --- PKCE (RFC 7636), S256 only --------------------------------------------------------
//
// OAuth 2.1 and the MCP spec require S256 whenever the client can do it, and every client
// Epexta supports can. `plain` is never accepted.

// RFC 7636 section 4.1/4.2: a verifier is 43-128 unreserved characters; an S256 challenge is
// the base64url (unpadded) SHA-256 of it, which is always exactly 43 characters.
const VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;
const S256_CHALLENGE_PATTERN = /^[A-Za-z0-9\-_]{43}$/;

export function isValidS256Challenge(challenge: string): boolean {
  return S256_CHALLENGE_PATTERN.test(challenge);
}

export function verifyPkceS256(codeVerifier: string, codeChallenge: string): boolean {
  if (!VERIFIER_PATTERN.test(codeVerifier)) return false;
  const expected = Buffer.from(crypto.createHash("sha256").update(codeVerifier).digest("base64url"));
  const actual = Buffer.from(codeChallenge);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}
