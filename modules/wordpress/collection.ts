import type { CollectionConfig, PayloadRequest, Where } from "payload";
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

// A connection belongs to the user who added it: the organisation scopes who may be
// asked about it, the user scopes which one an MCP caller or page actually sees.
function ownedByOrganisationAndUser(ctx: { organisationId: string }, req: PayloadRequest): Where {
  return { and: [{ organisation: { equals: ctx.organisationId } }, { user: { equals: req.user?.id } }] };
}

export const WordPressConnections: CollectionConfig = {
  slug: "wordpress-connections",
  admin: {
    useAsTitle: "siteUrl",
    description: "WordPress sites connected by a user of an organisation. Each connection is private to the user who added it.",
  },
  access: {
    read: async ({ req }) => {
      if (isSuperadmin(req)) return true;
      const ctx = await organisationRoleForRequest(req);
      return ctx ? ownedByOrganisationAndUser(ctx, req) : false;
    },
    create: ({ req }) => Boolean(req.user),
    update: async ({ req }) => {
      if (isSuperadmin(req)) return true;
      const ctx = await organisationRoleForRequest(req);
      return ctx?.role === "admin" ? ownedByOrganisationAndUser(ctx, req) : false;
    },
    delete: async ({ req }) => {
      if (isSuperadmin(req)) return true;
      const ctx = await organisationRoleForRequest(req);
      return ctx?.role === "admin" ? ownedByOrganisationAndUser(ctx, req) : false;
    },
  },
  // One user can't connect the same site twice, but two users (admins) of one organisation
  // each get their own connection to it - an MCP caller only ever sees their own.
  indexes: [{ fields: ["organisation", "user", "siteUrl"], unique: true }],
  fields: [
    {
      name: "organisation",
      type: "relationship",
      relationTo: "organisations",
      required: true,
      admin: { position: "sidebar" },
    },
    {
      name: "user",
      type: "relationship",
      relationTo: "users",
      required: true,
      admin: { position: "sidebar", description: "The user who connected this site. Only they can use or manage it." },
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
