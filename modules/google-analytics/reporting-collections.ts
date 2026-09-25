import type { CollectionConfig } from "payload";
import { serverOnlyAccess } from "../../lib/collection-access";

// Operational collections backing Phase 2's durable reporting state - see "Durable
// reporting state", "Distributed, race-safe refresh deduplication", and "GA4's quota
// boundary is per-property, per-project, and per-organisation" in
// GOOGLE_PERFORMANCE_PLAN.md. None of these are end-user-facing: the shared server-only
// access rule in lib/collection-access.ts (access returns false for every ordinary
// Payload REST/GraphQL/admin request), read and written exclusively by
// modules/google-analytics/reporting.ts using overrideAccess: true.
const REPORT_TYPES = ["post_performance", "site_performance"] as const;
const FRESHNESS_STATES = ["fresh", "stale", "delayed", "unavailable"] as const;

export const GoogleAnalyticsReportSnapshots: CollectionConfig = {
  slug: "google-analytics-report-snapshots",
  admin: {
    useAsTitle: "canonicalPostUrl",
    description: "Cached GA4 report results. Server-only - see modules/google-analytics/reporting.ts.",
  },
  access: serverOnlyAccess,
  fields: [
    { name: "mapping", type: "relationship", relationTo: "google-analytics-mappings", required: true, index: true },
    { name: "reportType", type: "select", required: true, options: REPORT_TYPES.map((v) => ({ label: v, value: v })) },
    { name: "canonicalPostUrl", type: "text", required: true },
    { name: "normalizedQueryParams", type: "text" },
    { name: "dateRangeStart", type: "date", required: true },
    { name: "dateRangeEnd", type: "date", required: true },
    { name: "timezone", type: "text", required: true, admin: { description: "The mapped GA4 property's own configured reporting timezone." } },
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

export const GoogleAnalyticsReportRefreshLeases: CollectionConfig = {
  slug: "google-analytics-report-refresh-leases",
  admin: {
    useAsTitle: "canonicalPostUrl",
    description: "Refresh-dedup leases for GA4 reports. Server-only - see modules/google-analytics/reporting.ts.",
  },
  access: serverOnlyAccess,
  fields: [
    { name: "mapping", type: "relationship", relationTo: "google-analytics-mappings", required: true, index: true },
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

// Organisation-level fairness/rate-limit counter - one of three quota layers this
// module checks (see "GA4's quota boundary..."), never a substitute for the other two.
export const GoogleAnalyticsQuotaUsage: CollectionConfig = {
  slug: "google-analytics-quota-usage",
  admin: {
    useAsTitle: "windowStart",
    description: "Per-organisation rate-limit counters for GA4 requests. Server-only.",
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

// GA4's property-wide budget, shared by every Google Cloud project that calls this
// property - keyed by ga4PropertyId alone, never by organisation (a property can be
// mapped by more than one organisation; this budget is genuinely shared between them).
// Populated from GA4's own returnPropertyQuota field, never estimated independently.
export const Ga4PropertyQuota: CollectionConfig = {
  slug: "ga4-property-quota",
  admin: {
    useAsTitle: "ga4PropertyId",
    description: "GA4 Data API property-wide quota, as last observed from returnPropertyQuota. Server-only.",
  },
  access: serverOnlyAccess,
  fields: [
    { name: "ga4PropertyId", type: "text", required: true, unique: true, index: true },
    { name: "tokensRemaining", type: "number" },
    { name: "tokensPerHour", type: "number" },
    { name: "tokensPerDay", type: "number" },
    { name: "concurrentRequests", type: "number" },
    { name: "lastObservedAt", type: "date", required: true },
  ],
};

// Epexta's own Google Cloud project's budget against one GA4 property - a separate
// budget from ga4-property-quota above; keyed by the compound (ga4PropertyId,
// googleCloudProjectId) pair, never organisation.
export const Ga4ProjectPropertyQuota: CollectionConfig = {
  slug: "ga4-project-property-quota",
  admin: {
    useAsTitle: "ga4PropertyId",
    description: "GA4 Data API per-(property, Google Cloud project) quota. Server-only.",
  },
  access: serverOnlyAccess,
  fields: [
    { name: "ga4PropertyId", type: "text", required: true, index: true },
    { name: "googleCloudProjectId", type: "text", required: true },
    { name: "tokensRemaining", type: "number" },
    { name: "tokensPerHour", type: "number" },
    { name: "tokensPerDay", type: "number" },
    { name: "concurrentRequests", type: "number" },
    { name: "lastObservedAt", type: "date", required: true },
  ],
  indexes: [{ fields: ["ga4PropertyId", "googleCloudProjectId"], unique: true }],
};
