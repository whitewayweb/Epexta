import { randomUUID } from "crypto";
import type { Payload } from "payload";
import { afterAll, describe, expect, it } from "vitest";
import { getPayloadClient } from "./payload";

// beginTransaction() returns `string | number | null` per Payload's BaseDatabaseAdapter -
// null means "no transaction could be established". Assert non-null so the rest of each
// test isn't laundering a silently-disabled transaction through a nullable type.
async function beginTransactionOrThrow(payload: Payload): Promise<string | number> {
  const transactionID = await payload.db.beginTransaction!();
  if (transactionID === null) throw new Error("beginTransaction() returned null - transactions are disabled.");
  return transactionID;
}

// Regression test for the "Enabling database transactions" section of
// GOOGLE_PERFORMANCE_PLAN.md: every "single DB transaction" design in that plan
// (mapping replacement, revocation cascades, refresh-lease acquisition) depends on
// payload.config.ts's Postgres adapter giving genuine multi-statement atomicity, not
// just on `beginTransaction`/`commitTransaction` failing to throw on the happy path.
// This forces a real rollback and asserts the first statement's effect does not
// survive it - the only evidence that atomicity, not just API surface, is present.
describe("database transactions", () => {
  const createdOrgIds: string[] = [];

  afterAll(async () => {
    if (createdOrgIds.length === 0) return;
    const payload = await getPayloadClient();
    for (const id of createdOrgIds) {
      await payload.delete({ collection: "organisations", id, overrideAccess: true }).catch(() => {});
    }
  });

  it("does not persist a transaction's effects when it is rolled back", async () => {
    const payload = await getPayloadClient();
    const marker = `tx-rollback-test-${randomUUID()}`;

    const transactionID = await beginTransactionOrThrow(payload);

    const doc = await payload.create({
      collection: "organisations",
      data: { name: marker, members: [] },
      req: { transactionID },
      overrideAccess: true,
    });

    await payload.db.rollbackTransaction!(transactionID);

    const afterRollback = await payload.find({
      collection: "organisations",
      where: { name: { equals: marker } },
      overrideAccess: true,
    });

    expect(afterRollback.docs).toHaveLength(0);
    // Rolled back - nothing to clean up via createdOrgIds, but guard against the
    // adapter having committed anyway (the exact failure this test exists to catch).
    if (afterRollback.docs.length > 0) createdOrgIds.push(String(doc.id));
  });

  it("persists a transaction's effects once committed", async () => {
    const payload = await getPayloadClient();
    const marker = `tx-commit-test-${randomUUID()}`;

    const transactionID = await beginTransactionOrThrow(payload);

    const doc = await payload.create({
      collection: "organisations",
      data: { name: marker, members: [] },
      req: { transactionID },
      overrideAccess: true,
    });

    await payload.db.commitTransaction!(transactionID);
    createdOrgIds.push(String(doc.id));

    const afterCommit = await payload.findByID({
      collection: "organisations",
      id: doc.id,
      overrideAccess: true,
    });

    expect(afterCommit.name).toBe(marker);
  });

  it("keeps two concurrent transactions' uncommitted writes isolated from each other", async () => {
    const payload = await getPayloadClient();
    const markerA = `tx-isolation-a-${randomUUID()}`;
    const markerB = `tx-isolation-b-${randomUUID()}`;

    const txA = await beginTransactionOrThrow(payload);
    const txB = await beginTransactionOrThrow(payload);

    const docA = await payload.create({
      collection: "organisations",
      data: { name: markerA, members: [] },
      req: { transactionID: txA },
      overrideAccess: true,
    });

    // Transaction B must not see transaction A's uncommitted row.
    const seenFromB = await payload.find({
      collection: "organisations",
      where: { name: { equals: markerA } },
      req: { transactionID: txB },
      overrideAccess: true,
    });
    expect(seenFromB.docs).toHaveLength(0);

    await payload.db.rollbackTransaction!(txA);
    await payload.db.rollbackTransaction!(txB);

    const afterBoth = await payload.find({
      collection: "organisations",
      where: { name: { in: [markerA, markerB] } },
      overrideAccess: true,
    });
    expect(afterBoth.docs).toHaveLength(0);
    void docA;
  });
});
