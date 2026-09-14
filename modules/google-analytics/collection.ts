import type { CollectionConfig, PayloadRequest } from "payload";
import { findMember, isSuperadmin, type MemberRow, type OrganisationRole } from "../../lib/members";
import { registerConnectionLifecycleHooks } from "../google-connections/registry";

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

// Owned by google-analytics alone - google-search-console has its own, entirely
// separate mapping collection (google-search-console/collection.ts), never this one.
// See "Mappings are capability-specific" in GOOGLE_PERFORMANCE_PLAN.md. ga4PropertyId is
// deliberately not unique: a GA4 property may legitimately be mapped to more than one
// WordPress site (the agency shared-property case).
export const GoogleAnalyticsMappings: CollectionConfig = {
  slug: "google-analytics-mappings",
  admin: {
    useAsTitle: "ga4PropertyId",
    description: "Which GA4 property reports for which connected WordPress site.",
  },
  access: {
    read: async ({ req }) => {
      if (isSuperadmin(req)) return true;
      const ctx = await organisationRoleForRequest(req);
      return ctx ? { organisation: { equals: ctx.organisationId } } : false;
    },
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: "organisation", type: "relationship", relationTo: "organisations", required: true, index: true },
    { name: "wordpressConnection", type: "relationship", relationTo: "wordpress-connections", required: true },
    { name: "googleConnection", type: "relationship", relationTo: "google-connections", required: true },
    { name: "ga4PropertyId", type: "text", required: true, admin: { description: "GA4 property identifier." } },
    {
      name: "reportingTimezone",
      type: "text",
      admin: { description: "The GA4 property's own configured reporting timezone, read from the Admin API at mapping time." },
    },
    { name: "confirmedBy", type: "relationship", relationTo: "users", required: true },
    { name: "confirmedAt", type: "date", required: true },
    { name: "lastValidatedAt", type: "date" },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "active",
      options: [
        { label: "Active", value: "active" },
        { label: "Needs reconnect", value: "needs_reconnect" },
        { label: "Needs remapping", value: "needs_remapping" },
        { label: "Superseded", value: "superseded" },
      ],
      index: true,
    },
    { name: "replacedAt", type: "date" },
    { name: "replacedBy", type: "relationship", relationTo: "google-analytics-mappings" },
  ],
};

registerConnectionLifecycleHooks("google-analytics", {
  isConnectionReferenced: async (connectionId) => {
    const { getPayloadClient } = await import("../../lib/payload");
    const payload = await getPayloadClient();
    const result = await payload.find({
      collection: "google-analytics-mappings",
      where: { googleConnection: { equals: connectionId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    return result.docs.length > 0;
  },
  markMappingsNeedingReconnect: async (connectionId) => {
    const { getPayloadClient } = await import("../../lib/payload");
    const payload = await getPayloadClient();
    const referencing = await payload.find({
      collection: "google-analytics-mappings",
      where: { googleConnection: { equals: connectionId }, status: { equals: "active" } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    });
    await Promise.all(
      referencing.docs.map((doc) =>
        payload.update({
          collection: "google-analytics-mappings",
          id: doc.id,
          data: { status: "needs_reconnect" },
          overrideAccess: true,
        })
      )
    );
  },
});
