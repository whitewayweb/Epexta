import type { CollectionConfig } from "payload";
import { supportReadableAccess } from "../lib/collection-access";
import { isSuperadmin } from "../lib/members";
import { logOAuthEvent } from "../lib/oauth/audit";

// One user's consent for one OAuth client to use one MCP resource on behalf of one
// organisation - what /settings/connected-apps lists and revokes. Every access/refresh
// token hangs off a grant, and every MCP request re-checks it (lib/oauth/tokens.ts), so
// revoking it cuts off its tokens on the next request.
//
// Grants are revoked (revokedAt), never deleted by application code, so "who connected
// what, when, and why it stopped" stays auditable. They only disappear through their
// user's/organisation's own deletion cascading (see the migration's ON DELETE CASCADE).
//
// `organisation` is stored explicitly rather than re-derived from the user on each request:
// getUserOrganisation (lib/organisation.ts) still assumes one organisation per user, and a
// grant pinned to an organisation is what lets a future multi-organisation consent picker
// ship without a schema or token change.
//
// Superadmins can browse grants in /admin (support) and revoke one there - setting
// "Revoked at" is the only edit the beforeChange hook lets through; everything else about
// a grant is immutable from the admin panel. Application code writes via lib/oauth/ with
// overrideAccess (no req.user), and a write made on a user's behalf inside another hook
// sets context.systemWrite (see Organisations.ts) - the hooks leave both alone.
export const OAuthGrants: CollectionConfig = {
  slug: "oauth-grants",
  admin: {
    description: "OAuth consent grants (connected apps). To disconnect one, set Revoked at - see lib/oauth/tokens.ts.",
    defaultColumns: ["user", "client", "resource", "createdAt", "lastUsedAt", "revokedAt"],
  },
  access: { ...supportReadableAccess, update: ({ req }) => isSuperadmin(req) },
  indexes: [{ fields: ["user", "revokedAt"] }],
  hooks: {
    beforeChange: [
      ({ operation, data, originalDoc, req, context }) => {
        if (operation !== "update" || !req.user || context.systemWrite || !originalDoc) return data;
        // Admin-panel edit: keep the stored grant, and only ever add a revocation.
        if (originalDoc.revokedAt || !data.revokedAt) return originalDoc;
        return { ...originalDoc, revokedAt: data.revokedAt, revokedReason: "admin", revokedBy: req.user.id };
      },
    ],
    afterChange: [
      ({ operation, doc, previousDoc, req, context }) => {
        if (operation === "update" && req.user && !context.systemWrite && doc.revokedAt && !previousDoc?.revokedAt) {
          logOAuthEvent("grants_revoked", { reason: "admin", by: String(req.user.id), grantIds: [String(doc.id)] });
        }
      },
    ],
  },
  fields: [
    { name: "user", type: "relationship", relationTo: "users", required: true, index: true },
    { name: "organisation", type: "relationship", relationTo: "organisations", required: true, index: true },
    { name: "client", type: "relationship", relationTo: "oauth-clients", required: true, index: true },
    { name: "resource", type: "text", required: true },
    {
      name: "scopes",
      type: "json",
      required: true,
      admin: { description: "Always empty today; kept so scoped grants can be added without a migration." },
    },
    { name: "lastUsedAt", type: "date" },
    { name: "revokedAt", type: "date" },
    {
      name: "revokedReason",
      type: "select",
      options: [
        { label: "Revoked by user", value: "user" },
        { label: "Revoked by an administrator", value: "admin" },
        { label: "Revoked by client", value: "client" },
        { label: "Refresh token reuse detected", value: "refresh_reuse" },
        { label: "Authorization code replay detected", value: "code_replay" },
        { label: "User left the organisation", value: "member_removed" },
      ],
    },
    {
      name: "revokedBy",
      type: "relationship",
      relationTo: "users",
      admin: { description: "Who revoked it, for a user or administrator revocation." },
    },
  ],
};
