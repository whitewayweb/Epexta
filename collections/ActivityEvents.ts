import type { CollectionConfig } from "payload";
import { supportReadableAccess } from "../lib/collection-access";
import { MODULES } from "../lib/modules";

// Platform-wide record of what AI apps did through Epexta's MCP tools (ACTIVITY_LOG_PLAN.md).
// Written only by lib/activity.ts (overrideAccess, after the tool call has responded) and
// read only through its helpers, which scope by organisation and - for members - by user.
// Superadmins can browse it read-only in /admin for support. It holds ids and short,
// sanitised labels, never a post body, prompt, credential, or token.
//
// Rows are meaningless without their organisation, so that FK is ON DELETE CASCADE (see the
// migration). The user FK is ON DELETE SET NULL and `actorLabel` keeps the name at the time,
// so the feed survives a user being deleted.
export const ActivityEvents: CollectionConfig = {
  slug: "activity-events",
  admin: {
    description: "What AI apps did through Epexta's MCP tools. Read-only; pruned after the retention window.",
    defaultColumns: ["createdAt", "organisation", "module", "tool", "outcome", "summary"],
  },
  access: supportReadableAccess,
  timestamps: true,
  indexes: [
    { fields: ["organisation", "createdAt"] },
    { fields: ["organisation", "module", "createdAt"] },
    { fields: ["organisation", "user", "createdAt"] },
  ],
  fields: [
    { name: "organisation", type: "relationship", relationTo: "organisations", required: true },
    { name: "user", type: "relationship", relationTo: "users" },
    { name: "actorLabel", type: "text", maxLength: 120 },
    {
      name: "module",
      type: "select",
      required: true,
      options: MODULES.map((m) => ({ label: m.name, value: m.slug })),
    },
    { name: "tool", type: "text", required: true, maxLength: 80 },
    {
      name: "kind",
      type: "select",
      required: true,
      options: [
        { label: "Read", value: "read" },
        { label: "Create", value: "create" },
        { label: "Update", value: "update" },
      ],
    },
    {
      name: "outcome",
      type: "select",
      required: true,
      options: [
        { label: "Success", value: "success" },
        { label: "Failure", value: "failure" },
      ],
    },
    { name: "summary", type: "text", required: true, maxLength: 200 },
    { name: "siteLabel", type: "text", maxLength: 200 },
    {
      name: "source",
      type: "select",
      required: true,
      options: [
        { label: "API key", value: "api-key" },
        { label: "OAuth", value: "oauth" },
      ],
    },
    { name: "client", type: "text", maxLength: 120 },
    {
      name: "errorCode",
      type: "select",
      options: [
        { label: "Module not enabled", value: "not_enabled" },
        { label: "Plan limit reached", value: "plan_limit" },
        { label: "Tool error", value: "tool_error" },
      ],
    },
    { name: "durationMs", type: "number" },
  ],
};
