import type { CollectionConfig, PayloadRequest } from "payload";
import { hasRole, isSuperadmin, memberUserId, ORGANISATION_ROLES, type MemberRow } from "../lib/members";
import { logOAuthEvent } from "../lib/oauth/audit";

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
    read: ({ req }) => {
      if (isSuperadmin(req)) return true;
      return req.user ? { "members.user": { equals: req.user.id } } : false;
    },
    create: ({ req }) => Boolean(req.user),
    update: ({ req, id }) => (isSuperadmin(req) ? true : isOrganisationAdmin(req, id)),
    delete: ({ req, id }) => (isSuperadmin(req) ? true : isOrganisationAdmin(req, id)),
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
    afterChange: [
      // Removing a member revokes their connected apps for this organisation straight away,
      // in the same transaction - whichever path removed them (Server Action or /admin).
      // Token verification also re-checks membership on every request (lib/oauth/tokens.ts),
      // so this is what keeps Connected apps and the audit trail accurate, not the only guard.
      async ({ operation, doc, previousDoc, req }) => {
        if (operation !== "update") return;
        const remaining = new Set(((doc.members ?? []) as MemberRow[]).map(memberUserId));
        const removed = ((previousDoc?.members ?? []) as MemberRow[])
          .map(memberUserId)
          .filter((userId) => !remaining.has(userId));
        if (removed.length === 0) return;

        const revoked = await req.payload.update({
          collection: "oauth-grants",
          where: {
            organisation: { equals: doc.id },
            user: { in: removed.map(Number) },
            revokedAt: { exists: false },
          },
          data: { revokedAt: new Date().toISOString(), revokedReason: "member_removed" },
          depth: 0,
          req,
          context: { systemWrite: true },
          overrideAccess: true,
        });
        if (revoked.docs.length > 0) {
          logOAuthEvent("grants_revoked", {
            reason: "member_removed",
            organisationId: String(doc.id),
            grantIds: revoked.docs.map((grant) => String(grant.id)),
          });
        }
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
