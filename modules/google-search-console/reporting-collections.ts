import type { CollectionConfig } from "payload";
import { serverOnlyAccess } from "../../lib/collection-access";

// Operational collections backing Phase 2's durable reporting state - see "Durable
// reporting state", "Distributed, race-safe refresh deduplication", and "Quota policy"
// in GOOGLE_PERFORMANCE_PLAN.md. None of these are end-user-facing: the shared server-only
// access rule in lib/collection-access.ts (access returns false for every ordinary
// Payload REST/GraphQL/admin request), read and written exclusively by
// modules/google-search-console/reporting.ts using overrideAccess: true.
const REPORT_TYPES = ["post_performance", "search_queries", "index_status", "site_performance"] as const;
const FRESHNESS_STATES = ["fresh", "stale", "delayed", "unavailable"] as const;

// Cache of normalised report results, keyed for exact lookup by
// (mapping, reportType, canonicalPostUrl, normalizedQueryParams, dateRangeStart,
// dateRangeEnd). The unique compound index means a refresh always updates the one row
// for its key rather than accumulating duplicate snapshots.
export const GoogleSearchConsoleReportSnapshots: CollectionConfig = {
  slug: "google-search-console-report-snapshots",
  admin: {
    useAsTitle: "canonicalPostUrl",
    description: "Cached Search Console report results. Server-only - see modules/google-search-console/reporting.ts.",
  },
  access: serverOnlyAccess,
  fields: [
    { name: "mapping", type: "relationship", relationTo: "google-search-console-mappings", required: true, index: true },
    { name: "reportType", type: "select", required: true, options: REPORT_TYPES.map((v) => ({ label: v, value: v })) },
    { name: "canonicalPostUrl", type: "text", required: true },
    { name: "normalizedQueryParams", type: "text" },
    { name: "dateRangeStart", type: "date", required: true },
    { name: "dateRangeEnd", type: "date", required: true },
    { name: "timezone", type: "text", required: true, admin: { description: "Always America/Los_Angeles for Search Console." } },
    { name: "fetchedAt", type: "date", required: true },
    { name: "expiresAt", type: "date", required: true, index: true },
    { name: "freshnessState", type: "select", required: true, options: FRESHNESS_STATES.map((v) => ({ label: v, value: v })) },
    { name: "payload", type: "json", required: true, admin: { description: "Normalised metrics/evidence only - never tokens or raw Google bodies." } },
  ],
  indexes: [
    {
      fields: ["mapping", "reportType", "canonicalPostUrl", "normalizedQueryParams", "dateRangeStart", "dateRangeEnd"],
      unique: true,
    },
  ],
};

// Distributed refresh-dedup lease - see "Distributed, race-safe refresh deduplication".
// A caller attempts to create the row for a report key; the unique compound index makes
// that create atomic (fails if a lease already exists), so exactly one concurrent
// caller ever holds the lease at a time.
export const GoogleSearchConsoleReportRefreshLeases: CollectionConfig = {
  slug: "google-search-console-report-refresh-leases",
  admin: {
    useAsTitle: "canonicalPostUrl",
    description: "Refresh-dedup leases for Search Console reports. Server-only - see modules/google-search-console/reporting.ts.",
  },
  access: serverOnlyAccess,
  fields: [
    { name: "mapping", type: "relationship", relationTo: "google-search-console-mappings", required: true, index: true },
    { name: "reportType", type: "select", required: true, options: REPORT_TYPES.map((v) => ({ label: v, value: v })) },
    { name: "canonicalPostUrl", type: "text", required: true },
    { name: "normalizedQueryParams", type: "text" },
    { name: "dateRangeStart", type: "date", required: true },
    { name: "dateRangeEnd", type: "date", required: true },
    { name: "leaseHolder", type: "text", required: true },
    { name: "leaseExpiresAt", type: "date", required: true, index: true },
  ],
  indexes: [
    {
      fields: ["mapping", "reportType", "canonicalPostUrl", "normalizedQueryParams", "dateRangeStart", "dateRangeEnd"],
      unique: true,
    },
  ],
};

// Organisation-level fairness/rate-limit counter - see "Quota policy". Keyed by
// (organisation, wordpressConnection, windowStart), durable so limits hold across
// instances and deployments, not process-local counters.
export const GoogleSearchConsoleQuotaUsage: CollectionConfig = {
  slug: "google-search-console-quota-usage",
  admin: {
    useAsTitle: "windowStart",
    description: "Per-organisation rate-limit counters for Search Console requests. Server-only.",
  },
  access: serverOnlyAccess,
  fields: [
    { name: "organisation", type: "relationship", relationTo: "organisations", required: true, index: true },
    { name: "wordpressConnection", type: "relationship", relationTo: "wordpress-connections", required: true },
    { name: "windowStart", type: "date", required: true },
    { name: "requestCount", type: "number", required: true, defaultValue: 0 },
  ],
  indexes: [{ fields: ["organisation", "wordpressConnection", "windowStart"], unique: true }],
};
