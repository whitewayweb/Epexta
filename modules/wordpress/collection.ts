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
    {
      name: "seoProviderPreference",
      type: "select",
      options: ["auto", "yoast", "rank-math", "aioseo"],
      defaultValue: "auto",
      admin: {
        description:
          "Which SEO plugin to assume when detection is ambiguous. Never overrides a confirmed absence of that plugin.",
      },
    },
    {
      name: "seoProfileState",
      type: "select",
      options: ["confirmed", "selected", "ambiguous", "unknown", "unsupported", "unavailable"],
      admin: { readOnly: true, description: "Last observed SEO provider profile state." },
    },
    {
      name: "seoProviderObserved",
      type: "select",
      options: ["yoast", "rank-math", "aioseo"],
      admin: { readOnly: true, description: "SEO provider last confirmed on this site, if any." },
    },
    {
      name: "seoProfileEvidence",
      type: "json",
      admin: { readOnly: true, description: "Probe evidence identifiers behind the last observed state." },
    },
    {
      name: "seoProfileObservedAt",
      type: "date",
      admin: { readOnly: true, description: "When the SEO provider was last probed." },
    },
    {
      name: "seoProfileError",
      type: "text",
      admin: { readOnly: true, description: "Diagnostic from the last failed probe, if any." },
    },
  ],
};
