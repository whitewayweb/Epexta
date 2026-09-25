/**
 * The app's canonical public origin (scheme + host, no trailing slash) - the OAuth
 * `issuer` and the prefix of every MCP route's OAuth `resource` URL. MCP/OAuth clients
 * compare both with exact string equality, so this must never be derived from a request's
 * Host/X-Forwarded-* headers (which differ across proxies and Vercel deployment URLs).
 *
 * `APP_URL` is the explicit, preferred source. The Vercel fallbacks keep a deployment that
 * hasn't set it yet working (production → its production domain, previews → the branch
 * URL) instead of breaking every MCP route on deploy day; local dev falls back to
 * http://localhost:<PORT>.
 */
export function getAppUrl(): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return normaliseOrigin(explicit);

  const vercelHost =
    process.env.VERCEL_ENV === "production"
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL
      : (process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL);
  if (vercelHost) return normaliseOrigin(`https://${vercelHost}`);

  return `http://localhost:${process.env.PORT ?? "3000"}`;
}

function normaliseOrigin(value: string): string {
  const url = new URL(value);
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("APP_URL must be a bare origin like https://app.example.com (no path, query, or fragment).");
  }
  return url.origin;
}
