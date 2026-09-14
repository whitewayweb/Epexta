import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPayloadClient } from "./payload";
import { checkAndIncrementQuota, getOrRefreshReport } from "./report-cache";
import { createOrReplaceMapping } from "../modules/google-analytics/mappings";

describe("getOrRefreshReport lease ownership", () => {
  let organisationId: string;
  let adminUserId: string;
  let wordpressConnectionId: string;
  let googleConnectionId: string;
  let mappingId: string;

  beforeAll(async () => {
    const payload = await getPayloadClient();
    const suffix = randomUUID();

    const adminUser = await payload.create({
      collection: "users",
      data: { email: `report-cache-admin-${suffix}@example.com`, password: "test-password-123", role: "customer" },
    });
    adminUserId = String(adminUser.id);

    const org = await payload.create({
      collection: "organisations",
      data: { name: `report-cache-org-${suffix}`, members: [{ user: Number(adminUserId), role: "admin" }] },
      overrideAccess: true,
    });
    organisationId = String(org.id);

    const wpConnection = await payload.create({
      collection: "wordpress-connections",
      data: {
        organisation: Number(organisationId),
        siteUrl: `https://report-cache-test-${suffix}.example.com`,
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
        googleAccountLabel: "Report cache test account",
        grantedScopes: ["https://www.googleapis.com/auth/analytics.readonly"],
        scopeProfile: "google-analytics",
        status: "active",
      },
      overrideAccess: true,
    });
    googleConnectionId = String(googleConnection.id);

    const mapping = await createOrReplaceMapping(
      organisationId,
      { wordpressConnectionId, googleConnectionId, ga4PropertyId: "properties/111222333", reportingTimezone: "UTC" },
      adminUserId
    );
    mappingId = mapping.mappingId;
  });

  afterAll(async () => {
    const payload = await getPayloadClient();
    await payload
      .delete({ collection: "google-analytics-mappings", where: { organisation: { equals: organisationId } }, overrideAccess: true })
      .catch(() => {});
    await payload
      .delete({ collection: "google-analytics-report-refresh-leases", where: { mapping: { equals: mappingId } }, overrideAccess: true })
      .catch(() => {});
    await payload
      .delete({ collection: "google-analytics-report-snapshots", where: { mapping: { equals: mappingId } }, overrideAccess: true })
      .catch(() => {});
    await payload.delete({ collection: "google-connections", id: googleConnectionId, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "wordpress-connections", id: wordpressConnectionId, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "organisations", id: organisationId, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "users", id: adminUserId, overrideAccess: true }).catch(() => {});
  });

  // Regression test for a lease-ownership bug: getOrRefreshReport's cleanup used to
  // re-query the lease collection by report key and delete whatever it found, rather
  // than the specific lease row it created. If this call's own lease was reclaimed as
  // abandoned (expired while fetchFresh was still in flight) and a different caller
  // then created a new lease under the same key, the old code would delete that other
  // caller's active lease out from under it, breaking refresh deduplication.
  it("deletes only the lease it created, never a different holder's lease under the same key", async () => {
    const key = {
      mapping: mappingId,
      reportType: "post_performance",
      canonicalPostUrl: "https://report-cache-test.example.com/lease-ownership/",
      normalizedQueryParams: null,
      dateRangeStart: "2025-01-01",
      dateRangeEnd: "2025-01-28",
    };

    let resolveFetch!: () => void;
    const fetchGate = new Promise<void>((resolve) => {
      resolveFetch = resolve;
    });

    const op = getOrRefreshReport({
      snapshotCollection: "google-analytics-report-snapshots",
      leaseCollection: "google-analytics-report-refresh-leases",
      key,
      ttlMs: 60_000,
      leaseTtlMs: 30_000,
      timezone: "UTC",
      fetchFresh: async () => {
        await fetchGate;
        return { status: "ok" as const, data: { fetched: true }, freshnessState: "fresh" as const };
      },
    });

    // Wait for the lease created by `op` to appear, then simulate another caller
    // reclaiming it as abandoned and taking over with its own lease under the same key -
    // exactly what happens if this call's lease expires while fetchFresh is still
    // running.
    const payload = await getPayloadClient();
    let originalLeaseId: string | number | undefined;
    for (let attempt = 0; attempt < 20 && originalLeaseId === undefined; attempt++) {
      const found = await payload.find({
        collection: "google-analytics-report-refresh-leases",
        where: {
          mapping: { equals: Number(mappingId) },
          reportType: { equals: key.reportType },
          canonicalPostUrl: { equals: key.canonicalPostUrl },
          dateRangeStart: { equals: key.dateRangeStart },
          dateRangeEnd: { equals: key.dateRangeEnd },
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      });
      originalLeaseId = found.docs[0]?.id;
      if (originalLeaseId === undefined) await new Promise((r) => setTimeout(r, 10));
    }
    expect(originalLeaseId).toBeDefined();

    await payload.delete({ collection: "google-analytics-report-refresh-leases", id: originalLeaseId!, overrideAccess: true });
    const otherLease = await payload.create({
      collection: "google-analytics-report-refresh-leases",
      data: {
        mapping: Number(mappingId),
        reportType: key.reportType,
        canonicalPostUrl: key.canonicalPostUrl,
        normalizedQueryParams: "",
        dateRangeStart: key.dateRangeStart,
        dateRangeEnd: key.dateRangeEnd,
        leaseHolder: "other-caller",
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      } as never,
      overrideAccess: true,
    });

    resolveFetch();
    await op;

    const stillHeld = await payload
      .findByID({ collection: "google-analytics-report-refresh-leases", id: otherLease.id, overrideAccess: true })
      .catch(() => null);
    expect(stillHeld).not.toBeNull();

    await payload.delete({ collection: "google-analytics-report-refresh-leases", id: otherLease.id, overrideAccess: true }).catch(() => {});
  });
});

describe("checkAndIncrementQuota create race", () => {
  let organisationId: string;
  let adminUserId: string;
  let wordpressConnectionId: string;

  beforeAll(async () => {
    const payload = await getPayloadClient();
    const suffix = randomUUID();

    const adminUser = await payload.create({
      collection: "users",
      data: { email: `quota-race-admin-${suffix}@example.com`, password: "test-password-123", role: "customer" },
    });
    adminUserId = String(adminUser.id);

    const org = await payload.create({
      collection: "organisations",
      data: { name: `quota-race-org-${suffix}`, members: [{ user: Number(adminUserId), role: "admin" }] },
      overrideAccess: true,
    });
    organisationId = String(org.id);

    const wpConnection = await payload.create({
      collection: "wordpress-connections",
      data: {
        organisation: Number(organisationId),
        siteUrl: `https://quota-race-test-${suffix}.example.com`,
        username: "admin",
        appPassword: "fake app password",
      },
      overrideAccess: true,
    });
    wordpressConnectionId = String(wpConnection.id);
  });

  afterAll(async () => {
    const payload = await getPayloadClient();
    await payload
      .delete({ collection: "google-analytics-quota-usage", where: { organisation: { equals: organisationId } }, overrideAccess: true })
      .catch(() => {});
    await payload.delete({ collection: "wordpress-connections", id: wordpressConnectionId, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "organisations", id: organisationId, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "users", id: adminUserId, overrideAccess: true }).catch(() => {});
  });

  // Regression test: when two concurrent first-requests for the same window raced to
  // create the quota row, the loser used to fall through with `existingDoc` still
  // undefined - returning `allowed: true` without ever rereading or incrementing the
  // winner's row, so it was let through uncounted against the limit. With exactly two
  // concurrent callers there is only ever one "loser" performing the reread-then-update,
  // so this reproduces the fixed race deterministically without also exercising the
  // separate (unaddressed) multi-loser update race that a larger fan-out would hit.
  it("counts both concurrent callers even when they race to create the window's row", async () => {
    const results = await Promise.all([
      checkAndIncrementQuota({
        quotaCollection: "google-analytics-quota-usage",
        organisationId,
        wordpressConnectionId,
        windowMs: 60 * 60 * 1000,
        limit: 100,
      }),
      checkAndIncrementQuota({
        quotaCollection: "google-analytics-quota-usage",
        organisationId,
        wordpressConnectionId,
        windowMs: 60 * 60 * 1000,
        limit: 100,
      }),
    ]);
    expect(results.every((r) => r.allowed)).toBe(true);

    const payload = await getPayloadClient();
    const rows = await payload.find({
      collection: "google-analytics-quota-usage",
      where: { organisation: { equals: organisationId }, wordpressConnection: { equals: wordpressConnectionId } },
      limit: 10,
      depth: 0,
      overrideAccess: true,
    });
    expect(rows.docs).toHaveLength(1);
    expect((rows.docs[0] as { requestCount: number }).requestCount).toBe(2);
  });
});
