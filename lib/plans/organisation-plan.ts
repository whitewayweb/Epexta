import { cache } from "react";
import { getPayloadClient } from "../payload";
import { resolvePlan, type EffectivePlan } from "./definitions";

/**
 * The plan this organisation is on right now (lib/plans.ts decides what that means for a
 * missing, suspended, or expired record). Like lib/entitlements.ts this uses
 * overrideAccess: true, so organisationId must already come from authenticated server-side
 * context, never from a client value.
 *
 * React's cache() shares one lookup per request between a page and the checks it makes; it
 * is not a cross-request cache, so a plan change takes effect on the very next request.
 */
export const getOrganisationPlan = cache(async (organisationId: string): Promise<EffectivePlan> => {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "organisation-plans",
    where: { organisation: { equals: organisationId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  const doc = result.docs[0];
  return resolvePlan(
    doc && {
      plan: doc.plan,
      status: doc.status,
      currentPeriodEnd: doc.currentPeriodEnd,
      maxSitesOverride: doc.maxSitesOverride,
      dailyToolCallsOverride: doc.dailyToolCallsOverride,
    }
  );
});
