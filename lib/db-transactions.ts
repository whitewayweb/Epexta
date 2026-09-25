import { getPayloadClient } from "./payload";

/** Pass as `req` to every Payload local-API call that must run inside the transaction. */
export interface TransactionReq {
  transactionID: string | number;
}

/**
 * Runs `work` inside one database transaction: committed if it resolves, rolled back (and
 * the error rethrown) if it throws. Keep `work` to database statements only - never an
 * external network call - so a slow upstream can't pin a pooled connection (see the
 * `db` comment in payload.config.ts). Real atomicity here is verified by
 * lib/db-transactions.test.ts.
 */
export async function runInTransaction<T>(work: (req: TransactionReq) => Promise<T>): Promise<T> {
  const payload = await getPayloadClient();
  const transactionID = await payload.db.beginTransaction!();
  if (transactionID === null) throw new Error("Could not start a database transaction.");

  try {
    const result = await work({ transactionID });
    await payload.db.commitTransaction!(transactionID);
    return result;
  } catch (error) {
    await payload.db.rollbackTransaction!(transactionID);
    throw error;
  }
}
