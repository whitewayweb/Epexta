import type { CollectionConfig, PayloadRequest } from "payload";
import { decrypt, encrypt } from "../../lib/crypto";
import { findMember, isSuperadmin, type MemberRow, type OrganisationRole } from "../../lib/members";

async function organisationRoleForRequest(
  req: PayloadRequest
): Promise<{ organisationId: string; role: OrganisationRole } | null> {
  if (!req.user) return null;
  const result = await req.payload.find({
    collection: "organisations",
    where: { "members.user": { equals: req.user.id } },
    limit: 1,
    overrideAccess: true,
  });

  const doc = result.docs[0];
  if (!doc) return null;

  const member = findMember((doc.members ?? []) as MemberRow[], String(req.user.id));
  if (!member) return null;

  return { organisationId: String(doc.id), role: member.role };
}

export const WordPressConnections: CollectionConfig = {
  slug: "wordpress-connections",
  admin: {
    useAsTitle: "siteUrl",
    description: "WordPress sites connected to an organisation. An organisation may connect more than one.",
  },
  access: {
    read: async ({ req }) => {
      if (isSuperadmin(req)) return true;
      const ctx = await organisationRoleForRequest(req);
      return ctx ? { organisation: { equals: ctx.organisationId } } : false;
    },
    create: ({ req }) => Boolean(req.user),
    update: async ({ req }) => {
      if (isSuperadmin(req)) return true;
      const ctx = await organisationRoleForRequest(req);
      return ctx?.role === "admin" ? { organisation: { equals: ctx.organisationId } } : false;
    },
    delete: async ({ req }) => {
      if (isSuperadmin(req)) return true;
      const ctx = await organisationRoleForRequest(req);
      return ctx?.role === "admin" ? { organisation: { equals: ctx.organisationId } } : false;
    },
  },
  fields: [
    {
      name: "organisation",
      type: "relationship",
      relationTo: "organisations",
      required: true,
      admin: { position: "sidebar" },
    },
    {
      name: "label",
      type: "text",
      admin: { description: "Optional nickname to tell this site apart from others, e.g. \"Main blog\"." },
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
