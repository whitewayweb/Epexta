import type { CollectionConfig, PayloadRequest } from "payload";
import { decrypt, encrypt } from "../../lib/crypto";
import { hasRole, TENANT_ROLES, type MemberRow } from "../../lib/members";

async function isTenantAdmin(req: PayloadRequest, id: string | number | undefined): Promise<boolean> {
  if (!req.user || !id) return false;
  const doc = await req.payload
    .findByID({ collection: "connections", id, overrideAccess: true })
    .catch(() => null);
  return hasRole((doc as { members?: MemberRow[] } | null)?.members, String(req.user.id), "admin");
}

export const Connections: CollectionConfig = {
  slug: "connections",
  admin: {
    useAsTitle: "siteUrl",
    description:
      "One WordPress site per tenant. Admin members manage the connection; member users only get their own API key.",
  },
  access: {
    read: ({ req }) => (req.user ? { "members.user": { equals: req.user.id } } : false),
    create: ({ req }) => Boolean(req.user),
    update: ({ req, id }) => isTenantAdmin(req, id),
    delete: ({ req, id }) => isTenantAdmin(req, id),
  },
  hooks: {
    beforeChange: [
      ({ operation, data, req }) => {
        if (operation === "create" && req.user && (!data.members || data.members.length === 0)) {
          data.members = [{ user: req.user.id, role: "admin" }];
        }
        return data;
      },
    ],
  },
  fields: [
    {
      name: "siteUrl",
      type: "text",
      required: true,
      admin: { description: "e.g. https://example.com (no trailing slash)" },
    },
    {
      name: "username",
      type: "text",
      required: true,
    },
    {
      name: "appPassword",
      type: "text",
      required: true,
      hooks: {
        beforeChange: [({ value }) => (typeof value === "string" && value ? encrypt(value) : value)],
        afterRead: [({ value }) => (typeof value === "string" && value ? decrypt(value) : value)],
      },
      admin: {
        description: "WordPress Application Password (24-char, encrypted at rest).",
      },
    },
    {
      name: "members",
      type: "array",
      minRows: 1,
      admin: {
        description: "Tenant admins manage the connection; members only get their own API key.",
      },
      fields: [
        {
          name: "user",
          type: "relationship",
          relationTo: "users",
          required: true,
        },
        {
          name: "role",
          type: "select",
          options: [...TENANT_ROLES],
          defaultValue: "member",
          required: true,
        },
      ],
    },
  ],
};
