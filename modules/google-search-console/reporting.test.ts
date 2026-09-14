import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getPayloadClient } from "../../lib/payload";
import { createOrReplaceMapping } from "./mappings";

vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  return { ...actual, querySearchAnalytics: vi.fn(), querySiteSearchAnalytics: vi.fn() };
});

vi.mock("../wordpress/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../wordpress/client")>();
  return {
    ...actual,
    createWordPressClient: vi.fn(() => ({
      getPostForPerformance: vi.fn().mockResolvedValue({
        postId: 42,
        canonicalLink: "https://reporting-test.example.com/hello-world/",
        status: "publish",
        modifiedAt: new Date().toISOString(),
      }),
    })),
  };
});

// Imported after the mocks so every call inside reporting.ts resolves to the mocked
// modules - these tests never talk to Google's or a real WordPress site's real API.
const { getPostPerformance, comparePostPerformance, getSitePerformance, compareSitePerformance, defaultDateRange, priorPeriod } =
  await import("./reporting");
const clientModule = await import("./client");
const querySearchAnalytics = vi.mocked(clientModule.querySearchAnalytics);
const querySiteSearchAnalytics = vi.mocked(clientModule.querySiteSearchAnalytics);

describe("google-search-console getPostPerformance", () => {
  let organisationId: string;
  let adminUserId: string;
  let wordpressConnectionId: string;
  let googleConnectionId: string;

  beforeAll(async () => {
    const payload = await getPayloadClient();
    const suffix = randomUUID();

    const adminUser = await payload.create({
      collection: "users",
      data: { email: `gsc-report-admin-${suffix}@example.com`, password: "test-password-123", role: "customer" },
    });
    adminUserId = String(adminUser.id);

    const org = await payload.create({
      collection: "organisations",
      data: { name: `gsc-report-org-${suffix}`, members: [{ user: Number(adminUserId), role: "admin" }] },
      overrideAccess: true,
    });
    organisationId = String(org.id);

    const wpConnection = await payload.create({
      collection: "wordpress-connections",
      data: {
        organisation: Number(organisationId),
        siteUrl: `https://reporting-test-${suffix}.example.com`,
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
        googleAccountLabel: "Reporting test account",
        grantedScopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
        scopeProfile: "google-search-console",
        status: "active",
      },
      overrideAccess: true,
    });
    googleConnectionId = String(googleConnection.id);

    await createOrReplaceMapping(
      organisationId,
      { wordpressConnectionId, googleConnectionId, searchConsolePropertyUrl: "sc-domain:reporting-test.example.com" },
      adminUserId
    );
  });

  afterAll(async () => {
    const payload = await getPayloadClient();
    await payload
      .delete({ collection: "google-search-console-mappings", where: { organisation: { equals: organisationId } }, overrideAccess: true })
      .catch(() => {});
    await payload
      .delete({
        collection: "google-search-console-report-snapshots",
        where: {
          or: [
            { canonicalPostUrl: { equals: "https://reporting-test.example.com/hello-world/" } },
            { canonicalPostUrl: { equals: "sc-domain:reporting-test.example.com" } },
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
      data: { organisation: Number(organisationId), siteUrl: `https://unmapped-${suffix}.example.com`, username: "admin", appPassword: "x" },
      overrideAccess: true,
    });

    const result = await getPostPerformance(organisationId, String(unmappedConnection.id), 42);
    expect(result.status).toBe("not_mapped");

    await payload.delete({ collection: "wordpress-connections", id: unmappedConnection.id, overrideAccess: true }).catch(() => {});
  });

  it("fetches fresh, caches the snapshot, and serves the cache on a second call without refetching", async () => {
    querySearchAnalytics.mockResolvedValue({
      status: "ok",
      data: { rows: [{ clicks: 10, impressions: 100, ctr: 0.1, position: 5.5 }] },
    });

    const range = { startDate: "2026-08-01", endDate: "2026-08-28" };
    const first = await getPostPerformance(organisationId, wordpressConnectionId, 42, range);
    expect(first.status).toBe("ok");
    if (first.status !== "ok") throw new Error("unreachable");
    expect(first.data.metrics).toEqual({ clicks: 10, impressions: 100, ctr: 0.1, position: 5.5 });
    expect(first.data.freshnessState).toBe("fresh");
    expect(querySearchAnalytics).toHaveBeenCalledTimes(1);

    const second = await getPostPerformance(organisationId, wordpressConnectionId, 42, range);
    expect(second.status).toBe("ok");
    if (second.status !== "ok") throw new Error("unreachable");
    expect(second.data.refreshPending).toBe(false);
    expect(querySearchAnalytics).toHaveBeenCalledTimes(1); // served from cache, no second Google call
  });

  it("returns consent_expired when the connection needs reconnecting", async () => {
    querySearchAnalytics.mockResolvedValue({ status: "error", reason: "needs_reconnect" });

    const result = await getPostPerformance(organisationId, wordpressConnectionId, 42, {
      startDate: "2025-01-01",
      endDate: "2025-01-28",
    });
    expect(result.status).toBe("consent_expired");
  });

  it("deduplicates two concurrent requests for the same report key - only one calls the Google API", async () => {
    querySearchAnalytics.mockResolvedValue({
      status: "ok",
      data: { rows: [{ clicks: 1, impressions: 1, ctr: 1, position: 1 }] },
    });

    // Both calls race for the same report key with no artificial delay - the refresh
    // lease's unique-constraint insert (not JS-level timing) is what guarantees only one
    // of them actually reaches the Google API, regardless of real network timing between
    // the two DB round trips.
    const range = { startDate: "2025-02-01", endDate: "2025-02-28" };
    await Promise.all([
      getPostPerformance(organisationId, wordpressConnectionId, 42, range),
      getPostPerformance(organisationId, wordpressConnectionId, 42, range),
    ]);

    // Whichever caller loses the lease race is served the winner's freshly-written
    // snapshot (if it lands first) or a stale/missing result - either way, the Google API
    // itself is called exactly once for two concurrent requests at the same key.
    expect(querySearchAnalytics).toHaveBeenCalledTimes(1);
  });

  it("compares two periods and reports both with correct date ranges", async () => {
    querySearchAnalytics.mockResolvedValue({
      status: "ok",
      data: { rows: [{ clicks: 5, impressions: 50, ctr: 0.1, position: 3 }] },
    });

    const range = { startDate: "2025-03-01", endDate: "2025-03-28" };
    const result = await comparePostPerformance(organisationId, wordpressConnectionId, 42, range);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.data.current.dateRangeStart).toBe("2025-03-01");
    expect(result.data.previous.dateRangeEnd).toBe("2025-02-28");
  });

  it("resolves site-wide Search Console metrics for the whole mapped property, not one post", async () => {
    querySiteSearchAnalytics.mockResolvedValue({
      status: "ok",
      data: { rows: [{ clicks: 200, impressions: 2000, ctr: 0.1, position: 4.2 }] },
    });

    const range = { startDate: "2025-04-01", endDate: "2025-04-28" };
    const result = await getSitePerformance(organisationId, wordpressConnectionId, range);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.data.metrics).toEqual({ clicks: 200, impressions: 2000, ctr: 0.1, position: 4.2 });
    expect(result.data.propertyUrl).toBe("sc-domain:reporting-test.example.com");
    expect(result.data.timezone).toBe("America/Los_Angeles");

    expect(querySiteSearchAnalytics).toHaveBeenCalledWith(
      googleConnectionId,
      expect.objectContaining({ propertyUrl: "sc-domain:reporting-test.example.com" })
    );
  });

  it("compares two site-wide periods and reports both with correct date ranges", async () => {
    querySiteSearchAnalytics.mockResolvedValue({
      status: "ok",
      data: { rows: [{ clicks: 20, impressions: 200, ctr: 0.1, position: 4 }] },
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
});
