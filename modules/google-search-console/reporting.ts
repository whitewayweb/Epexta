import { checkAndIncrementQuota, getOrRefreshReport, type FetchFreshResult } from "../../lib/report-cache";
import type { ApiRequestResult } from "../google-connections";
import { getWordPressConnection } from "../wordpress/organisation";
import { createWordPressClient } from "../wordpress/client";
import { getActiveMappingForWordPressConnection } from "./mappings";
import { querySearchAnalytics, querySiteSearchAnalytics, summarizeSearchAnalyticsRows } from "./client";

const SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const LEASE_TTL_MS = 30 * 1000;
const QUOTA_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const QUOTA_LIMIT_PER_WINDOW = 100;
const SEARCH_CONSOLE_TIMEZONE = "America/Los_Angeles";

export interface PostPerformanceMetrics {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface PostPerformanceData {
  canonicalPostUrl: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  timezone: string;
  freshnessState: "fresh" | "stale" | "delayed" | "unavailable";
  refreshPending: boolean;
  metrics: PostPerformanceMetrics;
}

export type PostPerformanceResult =
  | { status: "ok"; data: PostPerformanceData }
  | { status: "not_mapped" }
  | { status: "consent_expired" }
  | { status: "temporary_failure" }
  | { status: "unavailable" };

export interface DateRange {
  startDate: string;
  endDate: string;
}

/** Search Analytics data is always reported in Pacific Time, regardless of org timezone. */
function pacificDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SEARCH_CONSOLE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function defaultDateRange(days = 28, endingBefore = new Date()): DateRange {
  const endDate = pacificDate(endingBefore);
  const startDate = pacificDate(new Date(endingBefore.getTime() - days * 24 * 60 * 60 * 1000));
  return { startDate, endDate };
}

/**
 * `range`'s bounds are already Pacific calendar-date strings (from defaultDateRange or a
 * caller), not UTC instants - shifting them by whole days must stay in that same
 * calendar-date space (UTC-midnight-anchored arithmetic on the date string) rather than
 * re-converting through pacificDate(), which would re-apply the UTC-to-Pacific offset a
 * second time and shift the result by a day.
 */
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The equal-length period immediately preceding `range`, for compare_search_console_periods. */
export function priorPeriod(range: DateRange): DateRange {
  const start = new Date(`${range.startDate}T00:00:00Z`);
  const end = new Date(`${range.endDate}T00:00:00Z`);
  const spanDays = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return {
    startDate: addDays(range.startDate, -(spanDays + 1)),
    endDate: addDays(range.startDate, -1),
  };
}

class ConsentExpiredError extends Error {}

/**
 * Shared quota-check + Search Console call + error-mapping pipeline for both the
 * post-scoped and site-scoped report fetchers below - they differ only in which
 * querySearchAnalytics/querySiteSearchAnalytics call they make, so that's the only
 * thing left as a parameter. Mirrors runGa4ReportWithQuota in
 * modules/google-analytics/reporting.ts.
 */
async function runSearchConsoleQueryWithQuota(
  organisationId: string,
  wordpressConnectionId: string,
  apiCall: () => Promise<ApiRequestResult>
): Promise<FetchFreshResult<PostPerformanceMetrics>> {
  const quota = await checkAndIncrementQuota({
    quotaCollection: "google-search-console-quota-usage",
    organisationId,
    wordpressConnectionId,
    windowMs: QUOTA_WINDOW_MS,
    limit: QUOTA_LIMIT_PER_WINDOW,
  });
  if (!quota.allowed) return { status: "temporary_failure" };

  const result = await apiCall();

  if (result.status === "error") {
    if (result.reason === "revoked" || result.reason === "needs_reconnect") throw new ConsentExpiredError();
    if (result.reason === "temporary_failure" || result.reason === "forbidden") return { status: "temporary_failure" };
    return { status: "unavailable" };
  }

  const metrics = summarizeSearchAnalyticsRows(result.data as { rows?: unknown[] } as Parameters<typeof summarizeSearchAnalyticsRows>[0]);
  return { status: "ok", data: metrics, freshnessState: "fresh" };
}

function fetchAndSummarize(
  organisationId: string,
  wordpressConnectionId: string,
  googleConnectionId: string,
  propertyUrl: string,
  pagePath: string,
  range: DateRange
): Promise<FetchFreshResult<PostPerformanceMetrics>> {
  return runSearchConsoleQueryWithQuota(organisationId, wordpressConnectionId, () =>
    querySearchAnalytics(googleConnectionId, { propertyUrl, pagePath, startDate: range.startDate, endDate: range.endDate })
  );
}

/**
 * Resolves Search Console performance metrics for a specific WordPress post: loads the
 * active mapping, derives the post's canonical URL via the shared WordPress resolver,
 * then serves a cached snapshot or fetches fresh through the durable cache/lease/quota
 * pipeline in lib/report-cache.ts. Never accepts a caller-supplied URL - always derives
 * it from wordpressPostId, per "Post-identity resolution" in GOOGLE_PERFORMANCE_PLAN.md.
 */
export async function getPostPerformance(
  organisationId: string,
  wordpressConnectionId: string,
  wordpressPostId: number,
  range: DateRange = defaultDateRange()
): Promise<PostPerformanceResult> {
  const mapping = await getActiveMappingForWordPressConnection(organisationId, wordpressConnectionId);
  if (!mapping) return { status: "not_mapped" };

  const wpConnection = await getWordPressConnection(organisationId, wordpressConnectionId);
  if (!wpConnection) return { status: "not_mapped" };

  const post = await createWordPressClient(wpConnection).getPostForPerformance(wordpressPostId);

  try {
    const result = await getOrRefreshReport<PostPerformanceMetrics>({
      snapshotCollection: "google-search-console-report-snapshots",
      leaseCollection: "google-search-console-report-refresh-leases",
      key: {
        mapping: mapping.mappingId,
        reportType: "post_performance",
        canonicalPostUrl: post.canonicalLink,
        normalizedQueryParams: null,
        dateRangeStart: range.startDate,
        dateRangeEnd: range.endDate,
      },
      ttlMs: SNAPSHOT_TTL_MS,
      leaseTtlMs: LEASE_TTL_MS,
      timezone: SEARCH_CONSOLE_TIMEZONE,
      fetchFresh: () =>
        fetchAndSummarize(
          organisationId,
          wordpressConnectionId,
          mapping.googleConnectionId,
          mapping.searchConsolePropertyUrl,
          post.canonicalLink,
          range
        ),
    });

    if (result.status !== "ok") return result;
    return {
      status: "ok",
      data: {
        canonicalPostUrl: post.canonicalLink,
        dateRangeStart: range.startDate,
        dateRangeEnd: range.endDate,
        timezone: SEARCH_CONSOLE_TIMEZONE,
        freshnessState: result.snapshot.freshnessState,
        refreshPending: result.snapshot.refreshPending,
        metrics: result.snapshot.payload,
      },
    };
  } catch (error) {
    if (error instanceof ConsentExpiredError) return { status: "consent_expired" };
    throw error;
  }
}

export interface ComparePeriodsResult {
  status: "ok";
  data: { current: PostPerformanceData; previous: PostPerformanceData };
}

export type ComparePerformanceResult = ComparePeriodsResult | Exclude<PostPerformanceResult, { status: "ok" }>;

export async function comparePostPerformance(
  organisationId: string,
  wordpressConnectionId: string,
  wordpressPostId: number,
  range: DateRange = defaultDateRange()
): Promise<ComparePerformanceResult> {
  const current = await getPostPerformance(organisationId, wordpressConnectionId, wordpressPostId, range);
  if (current.status !== "ok") return current;

  const previous = await getPostPerformance(organisationId, wordpressConnectionId, wordpressPostId, priorPeriod(range));
  if (previous.status !== "ok") return previous;

  return { status: "ok", data: { current: current.data, previous: previous.data } };
}

export interface SitePerformanceData {
  propertyUrl: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  timezone: string;
  freshnessState: "fresh" | "stale" | "delayed" | "unavailable";
  refreshPending: boolean;
  metrics: PostPerformanceMetrics;
}

export type SitePerformanceResult =
  | { status: "ok"; data: SitePerformanceData }
  | { status: "not_mapped" }
  | { status: "consent_expired" }
  | { status: "temporary_failure" }
  | { status: "unavailable" };

function fetchAndSummarizeSite(
  organisationId: string,
  wordpressConnectionId: string,
  googleConnectionId: string,
  propertyUrl: string,
  range: DateRange
): Promise<FetchFreshResult<PostPerformanceMetrics>> {
  return runSearchConsoleQueryWithQuota(organisationId, wordpressConnectionId, () =>
    querySiteSearchAnalytics(googleConnectionId, { propertyUrl, startDate: range.startDate, endDate: range.endDate })
  );
}

/**
 * Resolves Search Console performance metrics for an entire mapped property (not one
 * post). The cache key reuses the canonicalPostUrl column to hold the property URL
 * (reportType: "site_performance" keeps it from colliding with any post-scoped row)
 * rather than adding a new column for a value that already fits the existing shape -
 * see the identical choice in modules/google-analytics/reporting.ts's getSitePerformance.
 */
export async function getSitePerformance(
  organisationId: string,
  wordpressConnectionId: string,
  range: DateRange = defaultDateRange()
): Promise<SitePerformanceResult> {
  const mapping = await getActiveMappingForWordPressConnection(organisationId, wordpressConnectionId);
  if (!mapping) return { status: "not_mapped" };

  const wpConnection = await getWordPressConnection(organisationId, wordpressConnectionId);
  if (!wpConnection) return { status: "not_mapped" };

  try {
    const result = await getOrRefreshReport<PostPerformanceMetrics>({
      snapshotCollection: "google-search-console-report-snapshots",
      leaseCollection: "google-search-console-report-refresh-leases",
      key: {
        mapping: mapping.mappingId,
        reportType: "site_performance",
        canonicalPostUrl: mapping.searchConsolePropertyUrl,
        normalizedQueryParams: null,
        dateRangeStart: range.startDate,
        dateRangeEnd: range.endDate,
      },
      ttlMs: SNAPSHOT_TTL_MS,
      leaseTtlMs: LEASE_TTL_MS,
      timezone: SEARCH_CONSOLE_TIMEZONE,
      fetchFresh: () =>
        fetchAndSummarizeSite(organisationId, wordpressConnectionId, mapping.googleConnectionId, mapping.searchConsolePropertyUrl, range),
    });

    if (result.status !== "ok") return result;
    return {
      status: "ok",
      data: {
        propertyUrl: mapping.searchConsolePropertyUrl,
        dateRangeStart: range.startDate,
        dateRangeEnd: range.endDate,
        timezone: SEARCH_CONSOLE_TIMEZONE,
        freshnessState: result.snapshot.freshnessState,
        refreshPending: result.snapshot.refreshPending,
        metrics: result.snapshot.payload,
      },
    };
  } catch (error) {
    if (error instanceof ConsentExpiredError) return { status: "consent_expired" };
    throw error;
  }
}

export interface CompareSitePeriodsResult {
  status: "ok";
  data: { current: SitePerformanceData; previous: SitePerformanceData };
}

export type CompareSitePerformanceResult = CompareSitePeriodsResult | Exclude<SitePerformanceResult, { status: "ok" }>;

export async function compareSitePerformance(
  organisationId: string,
  wordpressConnectionId: string,
  range: DateRange = defaultDateRange()
): Promise<CompareSitePerformanceResult> {
  const current = await getSitePerformance(organisationId, wordpressConnectionId, range);
  if (current.status !== "ok") return current;

  const previous = await getSitePerformance(organisationId, wordpressConnectionId, priorPeriod(range));
  if (previous.status !== "ok") return previous;

  return { status: "ok", data: { current: current.data, previous: previous.data } };
}
