import { getPayloadClient } from "./payload";

// Shared snapshot-cache + refresh-lease orchestration for both Google Site Hub modules'
// reporting clients - see "Durable reporting state" and "Distributed, race-safe refresh
// deduplication" in GOOGLE_PERFORMANCE_PLAN.md. Centralized here (rather than duplicated
// in modules/google-search-console/reporting.ts and modules/google-analytics/reporting.ts)
// per CLAUDE.md's rule to reuse one authoritative implementation for cross-cutting
// behaviour - the cache/lease dance is identical for both modules; only the collection
// slugs, TTLs, and the actual Google API call differ.
//
// The snapshot and lease collections' fields are structurally identical across both
// modules (see modules/*/reporting-collections.ts) even though their `mapping` field
// points at a different collection per module and Payload's generated local-API types
// are therefore collection-specific - this function takes the collection slug as a
// plain string and narrowly casts `where`/`data` at the Payload call sites below, rather
// than fighting the generated per-collection types for a structurally-shared shape.

export type FreshnessState = "fresh" | "stale" | "delayed" | "unavailable";

export interface ReportCacheKey {
  mapping: string;
  reportType: string;
  canonicalPostUrl: string;
  normalizedQueryParams: string | null;
  dateRangeStart: string;
  dateRangeEnd: string;
}

export interface ReportSnapshotResult<T> {
  payload: T;
  freshnessState: FreshnessState;
  fetchedAt: string;
  timezone: string;
  /** True when this is a stale/cached result served because a refresh is already in flight elsewhere. */
  refreshPending: boolean;
}

export type FetchFreshResult<T> =
  | { status: "ok"; data: T; freshnessState: FreshnessState }
  | { status: "temporary_failure" }
  | { status: "unavailable" };

export type GetOrRefreshResult<T> =
  | { status: "ok"; snapshot: ReportSnapshotResult<T> }
  | { status: "temporary_failure" }
  | { status: "unavailable" };

interface GetOrRefreshOptions<T> {
  snapshotCollection: string;
  leaseCollection: string;
  key: ReportCacheKey;
  /** How long a fresh snapshot may be served without refetching. */
  ttlMs: number;
  /** How long a refresh lease is held before being considered abandoned. */
  leaseTtlMs: number;
  timezone: string;
  fetchFresh: () => Promise<FetchFreshResult<T>>;
}

// Postgres unique indexes treat NULL as distinct from every other NULL, so a compound
// unique index with a nullable column (normalizedQueryParams, null when a report has no
// query-string component) would silently fail to deduplicate rows where it's null - the
// exact common case for post-performance reports. Normalize null to a fixed sentinel
// string instead, so every "no query params" row compares equal for uniqueness purposes.
const NO_QUERY_PARAMS = "";

function normalizeQueryParams(value: string | null): string {
  return value ?? NO_QUERY_PARAMS;
}

function whereForKey(key: ReportCacheKey) {
  return {
    mapping: { equals: Number(key.mapping) },
    reportType: { equals: key.reportType },
    canonicalPostUrl: { equals: key.canonicalPostUrl },
    normalizedQueryParams: { equals: normalizeQueryParams(key.normalizedQueryParams) },
    dateRangeStart: { equals: key.dateRangeStart },
    dateRangeEnd: { equals: key.dateRangeEnd },
  };
}

/**
 * Serves a cached report snapshot when fresh; otherwise attempts to acquire the refresh
 * lease (an atomic create against the lease collection's unique compound index - rejected
 * outright if a lease already exists) and calls `fetchFresh` if it wins, or returns the
 * existing stale snapshot with `refreshPending: true` if it loses the race. This is the
 * mechanism that actually deduplicates concurrent refreshes across instances - the
 * snapshot lookup's own uniqueness is for correctness of what's stored, not for
 * coordinating who's allowed to fetch.
 */
export async function getOrRefreshReport<T>(opts: GetOrRefreshOptions<T>): Promise<GetOrRefreshResult<T>> {
  const payload = await getPayloadClient();
  const now = Date.now();

  const existing = await payload.find({
    collection: opts.snapshotCollection as never,
    where: whereForKey(opts.key) as never,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const existingDoc = existing.docs[0] as
    | { id: string | number; payload: T; fetchedAt: string; expiresAt: string; freshnessState: FreshnessState }
    | undefined;

  if (existingDoc && new Date(existingDoc.expiresAt).getTime() > now) {
    return {
      status: "ok",
      snapshot: {
        payload: existingDoc.payload,
        freshnessState: existingDoc.freshnessState,
        fetchedAt: existingDoc.fetchedAt,
        timezone: opts.timezone,
        refreshPending: false,
      },
    };
  }

  // Clean up any expired lease before attempting to acquire a new one, so an abandoned
  // holder (crashed/timed-out request) doesn't permanently block refreshes.
  const staleLease = await payload.find({
    collection: opts.leaseCollection as never,
    where: whereForKey(opts.key) as never,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const staleLeaseDoc = staleLease.docs[0] as { id: string | number; leaseExpiresAt: string } | undefined;
  if (staleLeaseDoc && new Date(staleLeaseDoc.leaseExpiresAt).getTime() <= now) {
    await payload.delete({ collection: opts.leaseCollection as never, id: staleLeaseDoc.id, overrideAccess: true }).catch(() => {});
  }

  let acquiredLease = false;
  try {
    await payload.create({
      collection: opts.leaseCollection as never,
      data: {
        ...opts.key,
        mapping: Number(opts.key.mapping),
        normalizedQueryParams: normalizeQueryParams(opts.key.normalizedQueryParams),
        leaseHolder: `${process.pid}-${now}-${Math.random().toString(36).slice(2)}`,
        leaseExpiresAt: new Date(now + opts.leaseTtlMs).toISOString(),
      } as never,
      overrideAccess: true,
    });
    acquiredLease = true;
  } catch {
    // Unique constraint rejected the insert - another caller holds the lease.
    acquiredLease = false;
  }

  if (!acquiredLease) {
    if (existingDoc) {
      return {
        status: "ok",
        snapshot: {
          payload: existingDoc.payload,
          freshnessState: "stale",
          fetchedAt: existingDoc.fetchedAt,
          timezone: opts.timezone,
          refreshPending: true,
        },
      };
    }
    return { status: "unavailable" };
  }

  try {
    const fresh = await opts.fetchFresh();
    if (fresh.status !== "ok") {
      return fresh.status === "temporary_failure"
        ? existingDoc
          ? {
              status: "ok",
              snapshot: {
                payload: existingDoc.payload,
                freshnessState: "stale",
                fetchedAt: existingDoc.fetchedAt,
                timezone: opts.timezone,
                refreshPending: false,
              },
            }
          : { status: "temporary_failure" }
        : { status: "unavailable" };
    }

    const fetchedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + opts.ttlMs).toISOString();

    if (existingDoc) {
      await payload.update({
        collection: opts.snapshotCollection as never,
        id: existingDoc.id,
        data: { payload: fresh.data, fetchedAt, expiresAt, freshnessState: fresh.freshnessState } as never,
        overrideAccess: true,
      });
    } else {
      await payload.create({
        collection: opts.snapshotCollection as never,
        data: {
          ...opts.key,
          mapping: Number(opts.key.mapping),
          normalizedQueryParams: normalizeQueryParams(opts.key.normalizedQueryParams),
          timezone: opts.timezone,
          fetchedAt,
          expiresAt,
          freshnessState: fresh.freshnessState,
          payload: fresh.data,
        } as never,
        overrideAccess: true,
      });
    }

    return {
      status: "ok",
      snapshot: { payload: fresh.data, freshnessState: fresh.freshnessState, fetchedAt, timezone: opts.timezone, refreshPending: false },
    };
  } finally {
    const lease = await payload.find({
      collection: opts.leaseCollection as never,
      where: whereForKey(opts.key) as never,
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const leaseDoc = lease.docs[0] as { id: string | number } | undefined;
    if (leaseDoc) {
      await payload.delete({ collection: opts.leaseCollection as never, id: leaseDoc.id, overrideAccess: true }).catch(() => {});
    }
  }
}

/**
 * Explicitly invalidates (deletes, not just lets age out) every snapshot for a mapping -
 * called after a reconnect or remapping, since property access or the underlying data
 * can have changed and a stale-but-not-yet-expired snapshot would otherwise look
 * authoritative. See "Reconnect invalidates stale caches" in GOOGLE_PERFORMANCE_PLAN.md.
 */
export async function invalidateSnapshotsForMapping(snapshotCollection: string, mappingId: string): Promise<void> {
  const payload = await getPayloadClient();
  await payload.delete({
    collection: snapshotCollection as never,
    where: { mapping: { equals: mappingId } } as never,
    overrideAccess: true,
  });
}

/**
 * Organisation-level fairness/rate-limit counter - see "Quota policy". Increments (or
 * creates) the counter for the current window and returns whether the caller is still
 * under `limit`. The unique compound index on (organisation, wordpressConnection,
 * windowStart) is what makes the increment race-safe across concurrent requests.
 */
export async function checkAndIncrementQuota(opts: {
  quotaCollection: string;
  organisationId: string;
  wordpressConnectionId: string;
  windowMs: number;
  limit: number;
}): Promise<{ allowed: boolean; requestCount: number }> {
  const payload = await getPayloadClient();
  const windowStart = new Date(Math.floor(Date.now() / opts.windowMs) * opts.windowMs).toISOString();

  const existing = await payload.find({
    collection: opts.quotaCollection as never,
    where: {
      organisation: { equals: opts.organisationId },
      wordpressConnection: { equals: opts.wordpressConnectionId },
      windowStart: { equals: windowStart },
    } as never,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const existingDoc = existing.docs[0] as { id: string | number; requestCount: number } | undefined;

  if (!existingDoc) {
    try {
      await payload.create({
        collection: opts.quotaCollection as never,
        data: {
          organisation: Number(opts.organisationId),
          wordpressConnection: Number(opts.wordpressConnectionId),
          windowStart,
          requestCount: 1,
        } as never,
        overrideAccess: true,
      });
      return { allowed: true, requestCount: 1 };
    } catch {
      // Lost a create race to a concurrent request for the same window - fall through
      // and treat it the same as the existing-row path below.
    }
  }

  const current = existingDoc?.requestCount ?? 0;
  if (current >= opts.limit) return { allowed: false, requestCount: current };

  if (existingDoc) {
    await payload.update({
      collection: opts.quotaCollection as never,
      id: existingDoc.id,
      data: { requestCount: current + 1 } as never,
      overrideAccess: true,
    });
  }
  return { allowed: true, requestCount: current + 1 };
}
