import type { CollectionConfig } from "payload";
import { isSuperadmin } from "../lib/members";
import { PLAN_STATUSES, PLANS } from "../lib/plans/definitions";

// Platform-wide, like ModuleEntitlements: which plan an organisation is on. An organisation
// with no row is on the default plan (lib/plans.ts), so this holds only organisations that
// were moved off it. Only a superadmin (or, later, billing) writes it; lib/organisation-plan.ts
// is how everything else reads it. Versions keep a history of every plan change.
export const OrganisationPlans: CollectionConfig = {
  slug: "organisation-plans",
  admin: {
    description: "Which plan each organisation is on. No row means the Free plan. Superadmin-only.",
    defaultColumns: ["organisation", "plan", "status", "currentPeriodEnd", "source"],
  },
  access: {
    read: ({ req }) => isSuperadmin(req),
    create: ({ req }) => isSuperadmin(req),
    update: ({ req }) => isSuperadmin(req),
    delete: ({ req }) => isSuperadmin(req),
  },
  versions: {
    drafts: false,
    maxPerDoc: 100,
  },
  fields: [
    {
      name: "organisation",
      type: "relationship",
      relationTo: "organisations",
      required: true,
      unique: true,
    },
    {
      name: "plan",
      type: "select",
      required: true,
      defaultValue: "pro",
      options: PLANS.map((plan) => ({ label: plan.name, value: plan.slug })),
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "active",
      options: PLAN_STATUSES.map((status) => ({ label: status === "active" ? "Active" : "Suspended", value: status })),
      admin: { description: "A suspended organisation is treated as being on the Free plan." },
    },
    {
      name: "currentPeriodEnd",
      type: "date",
      admin: {
        description: "When the paid period ends; afterwards the organisation falls back to Free. Leave empty for no end.",
      },
    },
    {
      name: "maxSitesOverride",
      type: "number",
      min: 0,
      admin: { description: "Replaces the plan's site limit, e.g. 50 for an Agency with an extra 25-site pack." },
    },
    {
      name: "dailyToolCallsOverride",
      type: "number",
      min: 0,
      admin: { description: "Replaces the plan's daily tool call limit." },
    },
    {
      name: "source",
      type: "select",
      defaultValue: "manual",
      options: [
        { label: "Manual", value: "manual" },
        { label: "Billing", value: "billing" },
      ],
    },
  ],
};
