import { sql, type PostgresAdapter } from "@payloadcms/db-postgres";
import { getPayloadClient } from "./payload";

export { sql };

/**
 * Runs one hand-written SQL statement on Payload's Postgres connection. Reserve it for what
 * the local API can't do efficiently - a hot-path read that would otherwise populate
 * several relationships with a query each, or a bulk delete that would otherwise load
 * every row it deletes - and use Payload's table/column names as its migrations define
 * them. Everything else goes through the local API, so collection hooks and access rules
 * still apply; this bypasses both.
 */
export async function executeSql<Row extends Record<string, unknown>>(
  query: ReturnType<typeof sql>
): Promise<{ rows: Row[]; rowCount: number }> {
  const payload = await getPayloadClient();
  const result = await (payload.db as unknown as PostgresAdapter).drizzle.execute(query);
  return { rows: result.rows as Row[], rowCount: result.rowCount ?? 0 };
}
