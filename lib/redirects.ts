/**
 * Only ever redirect to a same-site path, so a user-supplied `redirectTo` can't be used as
 * an open redirect: it must start with a single "/" (not "//", which browsers treat as a
 * protocol-relative URL to another host). Anything else falls back to "/".
 */
export function safeRedirectPath(raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}
