import type { CollectionConfig } from "payload";
import { supportReadableAccess } from "../lib/collection-access";

// How many MCP tool calls an organisation has made on one UTC day - the meter behind each
// plan's daily allowance (lib/usage.ts). One row per organisation per day, incremented by
// a single atomic SQL statement, so it stays exact under concurrent calls and cheap to read
// however many events the activity log holds. Holds counts only. Superadmins can browse it
// read-only in /admin for support; old rows are pruned by /api/cron/usage-cleanup.
//
// Rows are meaningless without their organisation, so that FK is ON DELETE CASCADE (see the
// migration).
export const UsageDaily: CollectionConfig = {
  slug: "usage-daily",
  admin: {
    description: "Tool calls per organisation per UTC day. Read-only; pruned after the retention window.",
    defaultColumns: ["organisation", "day", "toolCalls"],
  },
  access: supportReadableAccess,
  indexes: [{ fields: ["organisation", "day"], unique: true }],
  fields: [
    { name: "organisation", type: "relationship", relationTo: "organisations", required: true },
    { name: "day", type: "text", required: true, admin: { description: "UTC date, YYYY-MM-DD." } },
    { name: "toolCalls", type: "number", required: true, defaultValue: 0 },
  ],
};
