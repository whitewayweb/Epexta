import type { CollectionConfig, PayloadRequest } from "payload";
import { decrypt, encrypt } from "../../lib/crypto";
import { findMember, type MemberRow, type TenantRole } from "../../lib/members";

async function tenantRoleForRequest(
  req: PayloadRequest
): Promise<{ tenantId: string; role: TenantRole } | null> {
  if (!req.user) return null;
  const result = await req.payload.find({
    collection: "tenants",
    where: { "members.user": { equals: req.user.id } },
    limit: 1,
    overrideAccess: true,
  });

  const doc = result.docs[0];
  if (!doc) return null;

  const member = findMember((doc.members ?? []) as MemberRow[], String(req.user.id));
  if (!member) return null;

  return { tenantId: String(doc.id), role: member.role };
}

export const WordPressConnections: CollectionConfig = {
  slug: "wordpress-connections",
  admin: {
    useAsTitle: "siteUrl",
    description: "One WordPress site per tenant.",
  },
  access: {
    read: async ({ req }) => {
      const ctx = await tenantRoleForRequest(req);
      return ctx ? { tenant: { equals: ctx.tenantId } } : false;
    },
    create: ({ req }) => Boolean(req.user),
    update: async ({ req }) => {
      const ctx = await tenantRoleForRequest(req);
      return ctx?.role === "admin" ? { tenant: { equals: ctx.tenantId } } : false;
    },
    delete: async ({ req }) => {
      const ctx = await tenantRoleForRequest(req);
      return ctx?.role === "admin" ? { tenant: { equals: ctx.tenantId } } : false;
    },
  },
  fields: [
    {
      name: "tenant",
      type: "relationship",
      relationTo: "tenants",
      required: true,
      unique: true,
      admin: { position: "sidebar" },
    },
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
  ],
};
