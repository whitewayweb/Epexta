import { executeGoogleApiRequest, type ApiRequestResult } from "../google-connections";

// Thin wrapper around the one GA4 Data API route Phase 2 needs (runReport, on the
// allowlist in modules/google-connections/allowlist.ts). Every outbound request still
// goes through executeGoogleApiRequest - this module never sees a Google access token.

export interface Ga4ReportRow {
  metricValues: { value: string }[];
}

interface Ga4RunReportResponse {
  rows?: Ga4ReportRow[];
  propertyQuota?: {
    tokensPerDay?: { remaining: number; consumed: number };
    tokensPerHour?: { remaining: number; consumed: number };
    concurrentRequests?: { remaining: number; consumed: number };
  };
}

export interface RunReportInput {
  ga4PropertyId: string;
  /** The mapped WordPress site's canonical hostname, e.g. "example.com". */
  hostName: string;
  /** The post's canonical path (plus query string when the site's identity depends on it). */
  pagePathPlusQueryString: string;
  startDate: string;
  endDate: string;
}

/**
 * Runs a GA4 report for one post, filtered by hostName + pagePathPlusQueryString per
 * "GA4 cross-site filtering" in GOOGLE_PERFORMANCE_PLAN.md - never path alone, since a
 * single GA4 property can legitimately serve multiple domains. Requests
 * `returnPropertyQuota` explicitly so the caller can observe GA4's own quota state
 * rather than estimating consumption independently.
 */
export async function runReport(connectionId: string, input: RunReportInput): Promise<ApiRequestResult> {
  return executeGoogleApiRequest(connectionId, "google-analytics", {
    method: "POST",
    url: `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(input.ga4PropertyId)}:runReport`,
    body: {
      dateRanges: [{ startDate: input.startDate, endDate: input.endDate }],
      metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "engagedSessions" }, { name: "keyEvents" }],
      dimensionFilter: {
        andGroup: {
          expressions: [
            { filter: { fieldName: "hostName", stringFilter: { matchType: "EXACT", value: input.hostName } } },
            {
              filter: {
                fieldName: "pagePathPlusQueryString",
                stringFilter: { matchType: "EXACT", value: input.pagePathPlusQueryString },
              },
            },
          ],
        },
      },
      returnPropertyQuota: true,
    },
  });
}

export interface Ga4Metrics {
  activeUsers: number;
  sessions: number;
  engagedSessions: number;
  keyEvents: number;
}

export function summarizeRunReportRows(response: Ga4RunReportResponse): Ga4Metrics {
  const rows = response.rows ?? [];
  if (rows.length === 0) return { activeUsers: 0, sessions: 0, engagedSessions: 0, keyEvents: 0 };
  const values = rows[0].metricValues;
  return {
    activeUsers: Number(values[0]?.value ?? 0),
    sessions: Number(values[1]?.value ?? 0),
    engagedSessions: Number(values[2]?.value ?? 0),
    keyEvents: Number(values[3]?.value ?? 0),
  };
}

export function extractPropertyQuota(response: Ga4RunReportResponse) {
  return response.propertyQuota ?? null;
}
