import { executeGoogleApiRequest, type ApiRequestResult } from "../google-connections";

// Thin wrapper around the one Search Console route Phase 2 needs
// (searchAnalytics/query, on the allowlist in modules/google-connections/allowlist.ts).
// Every outbound request still goes through executeGoogleApiRequest - this module never
// sees a Google access token, only typed request/response shapes.

export interface SearchAnalyticsRow {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface SearchAnalyticsResponse {
  rows?: SearchAnalyticsRow[];
}

export interface QuerySearchAnalyticsInput {
  /** e.g. "sc-domain:example.com" or a URL-prefix property. */
  propertyUrl: string;
  /** The post's canonical page path/URL, filtered as an exact "page" dimension match. */
  pagePath: string;
  startDate: string;
  endDate: string;
}

/**
 * Queries aggregate Search Analytics metrics (clicks/impressions/ctr/position) for one
 * page over a date range. Filters by the exact page URL, per the mapped property - never
 * an unfiltered site-wide query, since this always answers "how did this specific post
 * perform."
 */
export async function querySearchAnalytics(
  connectionId: string,
  input: QuerySearchAnalyticsInput
): Promise<ApiRequestResult> {
  return executeGoogleApiRequest(connectionId, "google-search-console", {
    method: "POST",
    url: `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(input.propertyUrl)}/searchAnalytics/query`,
    body: {
      startDate: input.startDate,
      endDate: input.endDate,
      dimensionFilterGroups: [
        { filters: [{ dimension: "page", operator: "equals", expression: input.pagePath }] },
      ],
    },
  });
}

export function summarizeSearchAnalyticsRows(response: SearchAnalyticsResponse): {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
} {
  const rows = response.rows ?? [];
  if (rows.length === 0) return { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  // Search Analytics returns one row per requested dimension combination - with no
  // dimensions requested, Google returns exactly one aggregate row for the filtered page.
  const row = rows[0];
  return { clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position };
}
