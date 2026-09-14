import { getPayloadClient } from "../../lib/payload";
import { checkAndIncrementQuota, getOrRefreshReport, type FetchFreshResult } from "../../lib/report-cache";
import { getWordPressConnection } from "../wordpress/organisation";
import { createWordPressClient } from "../wordpress/client";
import { getActiveMappingForWordPressConnection } from "./mappings";
import { runReport, summarizeRunReportRows, extractPropertyQuota, type Ga4Metrics } from "./client";

const SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const LEASE_TTL_MS = 30 * 1000;
const QUOTA_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const QUOTA_LIMIT_PER_WINDOW = 100;

export interface PostPerformanceData {
  canonicalPostUrl: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  timezone: string;
  freshnessState: "fresh" | "stale" | "delayed" | "unavailable";
  refreshPending: boolean;
  metrics: Ga4Metrics;
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

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function defaultDateRange(days = 28, endingBefore = new Date()): DateRange {
  return {
    startDate: isoDate(new Date(endingBefore.getTime() - days * 24 * 60 * 60 * 1000)),
    endDate: isoDate(endingBefore),
  };
}

/** The equal-length period immediately preceding `range`, for compare_analytics_periods. */
export function priorPeriod(range: DateRange): DateRange {
  const start = new Date(`${range.startDate}T00:00:00Z`);
  const end = new Date(`${range.endDate}T00:00:00Z`);
  const spanMs = end.getTime() - start.getTime();
  return {
    startDate: isoDate(new Date(start.getTime() - spanMs - 24 * 60 * 60 * 1000)),
    endDate: isoDate(new Date(start.getTime() - 24 * 60 * 60 * 1000)),
  };
}

class ConsentExpiredError extends Error {}

/** Persists GA4's own observed quota state - never estimated independently. */
async function recordGa4Quota(ga4PropertyId: string, quota: ReturnType<typeof extractPropertyQuota>): Promise<void> {
  if (!quota) return;
  const payload = await getPayloadClient();
  const lastObservedAt = new Date().toISOString();
  const fields = {
    tokensRemaining: quota.tokensPerDay?.remaining,
    tokensPerHour: quota.tokensPerHour?.remaining,
    tokensPerDay: quota.tokensPerDay?.remaining,
    concurrentRequests: quota.concurrentRequests?.remaining,
    lastObservedAt,
  };

  const existingProperty = await payload.find({
    collection: "ga4-property-quota",
    where: { ga4PropertyId: { equals: ga4PropertyId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  if (existingProperty.docs[0]) {
    await payload.update({ collection: "ga4-property-quota", id: existingProperty.docs[0].id, data: fields, overrideAccess: true });
  } else {
    await payload.create({ collection: "ga4-property-quota", data: { ga4PropertyId, ...fields }, overrideAccess: true }).catch(() => {});
  }

  const googleCloudProjectId = process.env.GOOGLE_CLOUD_PROJECT_ID || "";
  if (!googleCloudProjectId) return;

  const existingProject = await payload.find({
    collection: "ga4-project-property-quota",
    where: { ga4PropertyId: { equals: ga4PropertyId }, googleCloudProjectId: { equals: googleCloudProjectId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  if (existingProject.docs[0]) {
    await payload.update({ collection: "ga4-project-property-quota", id: existingProject.docs[0].id, data: fields, overrideAccess: true });
  } else {
    await payload
      .create({ collection: "ga4-project-property-quota", data: { ga4PropertyId, googleCloudProjectId, ...fields }, overrideAccess: true })
      .catch(() => {});
  }
}

async function fetchAndSummarize(
  organisationId: string,
  wordpressConnectionId: string,
  googleConnectionId: string,
  ga4PropertyId: string,
  hostName: string,
  pagePathPlusQueryString: string,
  range: DateRange
): Promise<FetchFreshResult<Ga4Metrics>> {
  const quota = await checkAndIncrementQuota({
    quotaCollection: "google-analytics-quota-usage",
    organisationId,
    wordpressConnectionId,
    windowMs: QUOTA_WINDOW_MS,
    limit: QUOTA_LIMIT_PER_WINDOW,
  });
  if (!quota.allowed) return { status: "temporary_failure" };

  const result = await runReport(googleConnectionId, {
    ga4PropertyId,
    hostName,
    pagePathPlusQueryString,
    startDate: range.startDate,
    endDate: range.endDate,
  });

  if (result.status === "error") {
    if (result.reason === "revoked" || result.reason === "needs_reconnect") throw new ConsentExpiredError();
    if (result.reason === "temporary_failure" || result.reason === "forbidden") return { status: "temporary_failure" };
    return { status: "unavailable" };
  }

  const response = result.data as Parameters<typeof summarizeRunReportRows>[0];
  await recordGa4Quota(ga4PropertyId, extractPropertyQuota(response));
  return { status: "ok", data: summarizeRunReportRows(response), freshnessState: "fresh" };
}

/**
 * Resolves GA4 performance metrics for a specific WordPress post: loads the active
 * mapping, derives the post's canonical URL via the shared WordPress resolver, filters
 * by hostName + pagePathPlusQueryString (never path alone - see "GA4 cross-site
 * filtering"), then serves a cached snapshot or fetches fresh through the durable
 * cache/lease/quota pipeline in lib/report-cache.ts.
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
  const url = new URL(post.canonicalLink);
  const hostName = url.hostname;
  const pagePathPlusQueryString = `${url.pathname}${url.search}`;
  const timezone = mapping.reportingTimezone || "UTC";

  try {
    const result = await getOrRefreshReport<Ga4Metrics>({
      snapshotCollection: "google-analytics-report-snapshots",
      leaseCollection: "google-analytics-report-refresh-leases",
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
      timezone,
      fetchFresh: () =>
        fetchAndSummarize(
          organisationId,
          wordpressConnectionId,
          mapping.googleConnectionId,
          mapping.ga4PropertyId,
          hostName,
          pagePathPlusQueryString,
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
        timezone,
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
