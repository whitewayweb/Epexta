/**
 * Only ever redirect to a same-site path, so a user-supplied `redirectTo` can't be used as
 * an open redirect: it must start with a single "/" (not "//", which browsers treat as a
 * protocol-relative URL to another host). Anything else falls back to `fallback`.
 */
/** Where a successful login/signup lands when no (valid) `redirectTo` was given. */
export const DEFAULT_SIGNED_IN_PATH = "/dashboard";

export function safeRedirectPath(raw: unknown, fallback = "/"): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : fallback;
}
