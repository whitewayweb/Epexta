import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getPayloadClient } from "../../lib/payload";
import { createOrReplaceMapping } from "./mappings";

vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  return { ...actual, runReport: vi.fn(), runSiteReport: vi.fn() };
});

vi.mock("../wordpress/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../wordpress/client")>();
  return {
    ...actual,
    createWordPressClient: vi.fn(() => ({
      getPostForPerformance: vi.fn().mockResolvedValue({
        postId: 42,
        canonicalLink: "https://ga-reporting-test.example.com/hello-world/?utm_source=x",
        status: "publish",
        modifiedAt: new Date().toISOString(),
      }),
    })),
  };
});

// Imported after the mocks so every call inside reporting.ts resolves to the mocked
// modules - these tests never talk to Google's or a real WordPress site's real API.
const {
  getPostPerformance,
  comparePostPerformance,
  getSitePerformance,
  compareSitePerformance,
  defaultDateRange,
  defaultDateRangeInTimezone,
  priorPeriod,
} = await import("./reporting");
const clientModule = await import("./client");
const runReport = vi.mocked(clientModule.runReport);
const runSiteReport = vi.mocked(clientModule.runSiteReport);

describe("google-analytics getPostPerformance", () => {
  let organisationId: string;
  let adminUserId: string;
  let wordpressConnectionId: string;
  let googleConnectionId: string;
  let hostName: string;

  beforeAll(async () => {
    const payload = await getPayloadClient();
    const suffix = randomUUID();

    const adminUser = await payload.create({
      collection: "users",
      data: { email: `ga-report-admin-${suffix}@example.com`, password: "test-password-123", role: "customer" },
    });
    adminUserId = String(adminUser.id);

    const org = await payload.create({
      collection: "organisations",
      data: { name: `ga-report-org-${suffix}`, members: [{ user: Number(adminUserId), role: "admin" }] },
      overrideAccess: true,
    });
    organisationId = String(org.id);

    const siteUrl = `https://ga-reporting-test-${suffix}.example.com`;
    hostName = new URL(siteUrl).hostname;
    const wpConnection = await payload.create({
      collection: "wordpress-connections",
      data: {
        organisation: Number(organisationId),
        siteUrl,
        username: "admin",
        appPassword: "fake app password",
      },
      overrideAccess: true,
    });
    wordpressConnectionId = String(wpConnection.id);

    const googleConnection = await payload.create({
      collection: "google-connections",
      data: {
        organisation: Number(organisationId),
        googleAccountLabel: "GA reporting test account",
        grantedScopes: ["https://www.googleapis.com/auth/analytics.readonly"],
        scopeProfile: "google-analytics",
        status: "active",
      },
      overrideAccess: true,
    });
    googleConnectionId = String(googleConnection.id);

    await createOrReplaceMapping(
      organisationId,
      { wordpressConnectionId, googleConnectionId, ga4PropertyId: "properties/999888777", reportingTimezone: "Europe/London" },
      adminUserId
    );
  });

  afterAll(async () => {
    const payload = await getPayloadClient();
    await payload
      .delete({ collection: "google-analytics-mappings", where: { organisation: { equals: organisationId } }, overrideAccess: true })
      .catch(() => {});
    await payload
      .delete({
        collection: "google-analytics-report-snapshots",
        where: {
          or: [
            { canonicalPostUrl: { equals: "https://ga-reporting-test.example.com/hello-world/?utm_source=x" } },
            { canonicalPostUrl: { equals: hostName } },
          ],
        },
        overrideAccess: true,
      })
      .catch(() => {});
    await payload.delete({ collection: "google-connections", id: googleConnectionId, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "wordpress-connections", id: wordpressConnectionId, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "organisations", id: organisationId, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "users", id: adminUserId, overrideAccess: true }).catch(() => {});
  });

  it("returns not_mapped for a WordPress connection with no active mapping", async () => {
    const payload = await getPayloadClient();
    const suffix = randomUUID();
    const unmappedConnection = await payload.create({
      collection: "wordpress-connections",
      data: { organisation: Number(organisationId), siteUrl: `https://ga-unmapped-${suffix}.example.com`, username: "admin", appPassword: "x" },
      overrideAccess: true,
    });

    const result = await getPostPerformance(organisationId, String(unmappedConnection.id), 42);
    expect(result.status).toBe("not_mapped");

    await payload.delete({ collection: "wordpress-connections", id: unmappedConnection.id, overrideAccess: true }).catch(() => {});
  });

  it("filters by hostName + pagePathPlusQueryString derived from the post's canonical URL, never path alone", async () => {
    runReport.mockResolvedValue({
      status: "ok",
      data: { rows: [{ metricValues: [{ value: "12" }, { value: "20" }, { value: "8" }, { value: "1" }] }] },
    });

    const range = { startDate: "2026-08-01", endDate: "2026-08-28" };
    const result = await getPostPerformance(organisationId, wordpressConnectionId, 42, range);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.data.metrics).toEqual({ activeUsers: 12, sessions: 20, engagedSessions: 8, keyEvents: 1 });
    expect(result.data.timezone).toBe("Europe/London");

    expect(runReport).toHaveBeenCalledWith(
      googleConnectionId,
      expect.objectContaining({
        ga4PropertyId: "properties/999888777",
        hostName: "ga-reporting-test.example.com",
        pagePathPlusQueryString: "/hello-world/?utm_source=x",
      })
    );
  });

  it("returns consent_expired when the connection needs reconnecting", async () => {
    runReport.mockResolvedValue({ status: "error", reason: "needs_reconnect" });

    const result = await getPostPerformance(organisationId, wordpressConnectionId, 42, {
      startDate: "2025-01-01",
      endDate: "2025-01-28",
    });
    expect(result.status).toBe("consent_expired");
  });

  it("compares two periods and reports both with correct date ranges", async () => {
    runReport.mockResolvedValue({
      status: "ok",
      data: { rows: [{ metricValues: [{ value: "1" }, { value: "2" }, { value: "1" }, { value: "0" }] }] },
    });

    const range = { startDate: "2025-03-01", endDate: "2025-03-28" };
    const result = await comparePostPerformance(organisationId, wordpressConnectionId, 42, range);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.data.current.dateRangeStart).toBe("2025-03-01");
    expect(result.data.previous.dateRangeEnd).toBe("2025-02-28");
    expect(result.data.previous.dateRangeStart).toBe("2025-02-01");
  });

  it("defaults to the mapped GA4 property's own reporting timezone, not UTC", async () => {
    runReport.mockResolvedValue({
      status: "ok",
      data: { rows: [{ metricValues: [{ value: "1" }, { value: "1" }, { value: "1" }, { value: "0" }] }] },
    });

    const expected = defaultDateRangeInTimezone("Europe/London");
    const result = await getPostPerformance(organisationId, wordpressConnectionId, 42);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.data.dateRangeStart).toBe(expected.startDate);
    expect(result.data.dateRangeEnd).toBe(expected.endDate);
  });

  it("resolves site-wide GA4 metrics using the WordPress connection's hostname, not one post", async () => {
    runSiteReport.mockResolvedValue({
      status: "ok",
      data: { rows: [{ metricValues: [{ value: "100" }, { value: "50" }, { value: "40" }, { value: "5" }] }] },
    });

    const range = { startDate: "2025-04-01", endDate: "2025-04-28" };
    const result = await getSitePerformance(organisationId, wordpressConnectionId, range);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.data.metrics).toEqual({ activeUsers: 100, sessions: 50, engagedSessions: 40, keyEvents: 5 });
    expect(result.data.hostName).toBe(hostName);
    expect(result.data.timezone).toBe("Europe/London");

    expect(runSiteReport).toHaveBeenCalledWith(
      googleConnectionId,
      expect.objectContaining({ ga4PropertyId: "properties/999888777", hostName })
    );
  });

  it("compares two site-wide periods and reports both with correct date ranges", async () => {
    runSiteReport.mockResolvedValue({
      status: "ok",
      data: { rows: [{ metricValues: [{ value: "10" }, { value: "5" }, { value: "4" }, { value: "1" }] }] },
    });

    const range = { startDate: "2025-05-01", endDate: "2025-05-28" };
    const result = await compareSitePerformance(organisationId, wordpressConnectionId, range);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.data.current.dateRangeStart).toBe("2025-05-01");
    expect(result.data.previous.dateRangeEnd).toBe("2025-04-30");
    expect(result.data.previous.dateRangeStart).toBe("2025-04-03");
  });
});

describe("date range helpers", () => {
  it("defaultDateRange spans 28 trailing days ending at the given date", () => {
    const range = defaultDateRange(28, new Date("2026-06-15T12:00:00Z"));
    expect(range.endDate).toBe("2026-06-15");
    expect(range.startDate).toBe("2026-05-18");
  });

  it("priorPeriod returns the equal-length immediately preceding period", () => {
    const prior = priorPeriod({ startDate: "2026-06-01", endDate: "2026-06-28" });
    expect(prior.endDate).toBe("2026-05-31");
    expect(prior.startDate).toBe("2026-05-04");
  });

  it("defaultDateRangeInTimezone anchors the boundary to the given timezone, not UTC", () => {
    // 2026-06-15T23:30:00Z is already 2026-06-16 in Auckland (UTC+12) but still
    // 2026-06-15 in UTC - the two functions must disagree on "today" here.
    const instant = new Date("2026-06-15T23:30:00Z");
    expect(defaultDateRange(28, instant).endDate).toBe("2026-06-15");
    expect(defaultDateRangeInTimezone("Pacific/Auckland", 28, instant).endDate).toBe("2026-06-16");
  });
});
