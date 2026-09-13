import type { CollectionConfig } from "payload";
import { isSuperadmin } from "../lib/members";
import { MODULES } from "../lib/modules";

// Platform-wide, like Users/Organisations: which modules (lib/modules.ts's registry)
// are enabled for which organisation. Only a superadmin can write or read this collection
// directly - lib/entitlements.ts is how every module actually asks "is X enabled?", the
// same way lib/organisation.ts is the only reader of Organisations for gating decisions.
export const ModuleEntitlements: CollectionConfig = {
  slug: "module-entitlements",
  admin: {
    description: "Which modules are enabled for which organisation. Superadmin-only.",
    defaultColumns: ["organisation", "moduleSlug", "enabled", "source"],
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
  indexes: [{ fields: ["organisation", "moduleSlug"], unique: true }],
  fields: [
    {
      name: "organisation",
      type: "relationship",
      relationTo: "organisations",
      required: true,
    },
    {
      name: "moduleSlug",
      type: "select",
      required: true,
      options: MODULES.map((m) => ({ label: m.name, value: m.slug })),
    },
    {
      name: "enabled",
      type: "checkbox",
      defaultValue: true,
    },
    {
      name: "source",
      type: "select",
      defaultValue: "manual",
      options: [
        { label: "Manual", value: "manual" },
        { label: "Billing", value: "billing" },
        { label: "Migration", value: "migration" },
      ],
    },
  ],
};
