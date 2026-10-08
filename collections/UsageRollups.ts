import type { CollectionConfig } from "payload";
import { supportReadableAccess } from "../lib/collection-access";

// The long-term record of what each organisation did through MCP tools: one row per
// organisation, UTC day, module and tool, folded from the activity log by
// lib/usage-rollup.ts before the raw events are purged (ACTIVITY_RETENTION_DAYS). Raw events
// are for the feed and support; this is what usage history, reports and billing read, and
// it is kept indefinitely - a few rows per organisation per active day, never per call.
// Holds counts only. Written only by the rollup job (raw SQL, recomputed per day, so safe to
// re-run); superadmins can browse it read-only in /admin.
//
// module/tool/kind are plain text, not enums: history must outlive a retired module or tool.
// Rows are meaningless without their organisation, so that FK is ON DELETE CASCADE (see the
// migration).
export const UsageRollups: CollectionConfig = {
  slug: "usage-rollups",
  admin: {
    description: "Daily tool-call totals per organisation, module and tool. Read-only; kept indefinitely.",
    defaultColumns: ["organisation", "day", "module", "tool", "calls", "failures"],
  },
  access: supportReadableAccess,
  indexes: [
    { fields: ["organisation", "day", "module", "tool"], unique: true },
    { fields: ["day"] },
  ],
  fields: [
    { name: "organisation", type: "relationship", relationTo: "organisations", required: true },
    { name: "day", type: "text", required: true, admin: { description: "UTC date, YYYY-MM-DD." } },
    { name: "module", type: "text", required: true },
    { name: "tool", type: "text", required: true },
    { name: "kind", type: "text", required: true },
    { name: "calls", type: "number", required: true, defaultValue: 0 },
    { name: "failures", type: "number", required: true, defaultValue: 0 },
    { name: "planLimited", type: "number", required: true, defaultValue: 0, admin: { description: "Calls refused by the plan's daily limit (also counted in failures)." } },
  ],
};
