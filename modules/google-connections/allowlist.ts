import type { GoogleCapability } from "./capabilities";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface AllowlistEntry {
  method: HttpMethod;
  /** A URL with `*` wildcard path segments - never a wildcarded host. See GOOGLE_PERFORMANCE_PLAN.md. */
  pattern: string;
}

// Exhaustive, hardcoded per-capability method+URL-pattern allowlist. executeGoogleApiRequest
// validates every outbound request against this before it ever attaches a token - see
// "Public interface both modules use" in GOOGLE_PERFORMANCE_PLAN.md for why this is a
// method+pattern list and not a bare origin allowlist (the two capabilities' features span
// four different API hosts, and an origin-only check can't distinguish a read route from a
// write route on the same host). Not configurable by either consuming module - adding a
// route here is a deliberate, reviewed change, the same weight as adding a new OAuth scope.
const ALLOWLIST: Record<GoogleCapability, AllowlistEntry[]> = {
  "google-search-console": [
    { method: "GET", pattern: "https://www.googleapis.com/webmasters/v3/sites" },
    { method: "GET", pattern: "https://www.googleapis.com/webmasters/v3/sites/*" },
    { method: "POST", pattern: "https://www.googleapis.com/webmasters/v3/sites/*/searchAnalytics/query" },
    { method: "POST", pattern: "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect" },
  ],
  "google-analytics": [
    { method: "POST", pattern: "https://analyticsdata.googleapis.com/v1beta/properties/*:runReport" },
    { method: "GET", pattern: "https://analyticsadmin.googleapis.com/v1beta/accountSummaries" },
    { method: "GET", pattern: "https://analyticsadmin.googleapis.com/v1beta/properties/*" },
  ],
};

function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]+");
  return new RegExp(`^${escaped}$`);
}

/** Wildcard segments never span "/", and query strings are never part of the matched URL. */
export function isRequestAllowlisted(capability: GoogleCapability, method: string, url: string): boolean {
  const entries = ALLOWLIST[capability];
  const withoutQuery = url.split("?")[0] ?? url;
  return entries.some((entry) => entry.method === method && patternToRegExp(entry.pattern).test(withoutQuery));
}
