import type { CollectionConfig, PayloadRequest } from "payload";
import { hasRole, ORGANISATION_ROLES, type MemberRow } from "../lib/members";

async function isOrganisationAdmin(req: PayloadRequest, id: string | number | undefined): Promise<boolean> {
  if (!req.user || !id) return false;
  const doc = await req.payload.findByID({ collection: "organisations", id, overrideAccess: true }).catch(() => null);
  return hasRole((doc as { members?: MemberRow[] } | null)?.members, String(req.user.id), "admin");
}

export const Organisations: CollectionConfig = {
  slug: "organisations",
  admin: {
    useAsTitle: "name",
    description: "A team/account. Any module (WordPress, future integrations) attaches to one of these.",
  },
  access: {
    read: ({ req }) => (req.user ? { "members.user": { equals: req.user.id } } : false),
    create: ({ req }) => Boolean(req.user),
    update: ({ req, id }) => isOrganisationAdmin(req, id),
    delete: ({ req, id }) => isOrganisationAdmin(req, id),
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
      name: "name",
      type: "text",
      admin: { description: "Optional display name for this team." },
    },
    {
      name: "members",
      type: "array",
      minRows: 1,
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
          options: [...ORGANISATION_ROLES],
          defaultValue: "member",
          required: true,
        },
      ],
    },
  ],
};
