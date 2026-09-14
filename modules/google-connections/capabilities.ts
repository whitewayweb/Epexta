// The fixed set of modules allowed to hold a google-connections row. This is a
// deliberately small, local list - not lib/modules.ts's full registry - because
// google-connections has no entitlement of its own and must not need to change
// every time an unrelated, non-Google module is added to the platform. Adding a
// third Google Site Hub module means adding one entry here (its own scope, its own
// allowlist in allowlist.ts), the same review weight as adding a new OAuth scope.
export const GOOGLE_CAPABILITIES = ["google-search-console", "google-analytics"] as const;
export type GoogleCapability = (typeof GOOGLE_CAPABILITIES)[number];

// The exact scope each capability's connect flow requests - and the exact scope
// Google's token response must return for handleCallback to accept the exchange.
// A connection's scopeProfile records which entry here it was authorized against;
// see "Scope isolation" in GOOGLE_PERFORMANCE_PLAN.md for why the returned grant is
// checked for an exact match rather than "at least this scope."
export const CAPABILITY_SCOPES: Record<GoogleCapability, string> = {
  "google-search-console": "https://www.googleapis.com/auth/webmasters.readonly",
  "google-analytics": "https://www.googleapis.com/auth/analytics.readonly",
};
