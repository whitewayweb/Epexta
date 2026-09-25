import type { CollectionConfig } from "payload";
import { isSuperadmin } from "./members";

// Access rules for a collection that holds secrets or security state (API keys, OAuth
// clients/codes/grants/tokens): no ordinary Payload REST/GraphQL/admin CRUD at all, and
// only superadmins see the collection in /admin. All reads and writes go through that
// collection's own lib/ helpers, which check the caller themselves before using
// overrideAccess: true - never through a relaxed `access` rule.
export const serverOnlyAccess: CollectionConfig["access"] = {
  read: () => false,
  create: () => false,
  update: () => false,
  delete: () => false,
  admin: ({ req }) => isSuperadmin(req),
};

/**
 * serverOnlyAccess, plus read-only browsing in /admin for superadmins - for security state
 * support needs to see (which apps a user connected, when, and why they stopped) that
 * holds no secret. Never use it for a collection storing a secret or its hash.
 */
export const supportReadableAccess: CollectionConfig["access"] = {
  ...serverOnlyAccess,
  read: ({ req }) => isSuperadmin(req),
};
