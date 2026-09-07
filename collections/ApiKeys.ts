import type { CollectionConfig } from "payload";

// Platform-wide (not WordPress-specific): a user can hold several named API keys,
// each usable as a bearer token against any module's MCP endpoint. Access is locked
// down to superadmins only because every mutation goes through lib/api-keys.ts,
// which checks the caller's own user id with overrideAccess: true - see that file's
// listApiKeys/createApiKey/deleteApiKey for the actual authorization checks.
export const ApiKeys: CollectionConfig = {
  slug: "api-keys",
  admin: {
    useAsTitle: "name",
  },
  access: {
    read: () => false,
    create: () => false,
    update: () => false,
    delete: () => false,
    admin: ({ req: { user } }) => user?.role === "superadmin",
  },
  fields: [
    {
      name: "user",
      type: "relationship",
      relationTo: "users",
      required: true,
      index: true,
    },
    {
      name: "name",
      type: "text",
      required: true,
    },
    {
      // SHA-256 hex digest of the raw key - the raw value is shown once at creation
      // and never stored. Looking up a bearer token means hashing it and matching here.
      name: "hashedKey",
      type: "text",
      required: true,
      unique: true,
      index: true,
    },
  ],
};
