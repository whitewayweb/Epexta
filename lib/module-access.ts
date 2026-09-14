import { requireModuleEnabledForUser } from "./entitlements";
import { getUserOrganisation } from "./organisation";
import { getCurrentUser } from "./session";
import type { ModuleSlug } from "./modules";

export interface AuthorisedActor {
  userId: string;
  organisationId: string;
}

/**
 * Platform-wide guard for a module's admin-only Server Actions - connecting,
 * reconnecting, disconnecting, mapping, inviting/removing members. See "Role model"
 * in CLAUDE.md: only an organisation admin manages a module's connection. Currently
 * used by the Google Site Hub modules (modules/google-analytics/actions.ts,
 * modules/google-search-console/actions.ts); modules/wordpress/actions.ts predates
 * this helper and returns error strings with per-action custom messages instead of
 * throwing, plus one lazy-organisation-creation exception, so it isn't a drop-in
 * replacement there without a deliberate, separately-reviewed reconciliation.
 */
export async function requireOrganisationAdmin(moduleSlug: ModuleSlug, moduleLabel: string): Promise<AuthorisedActor> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be logged in.");

  const entitlement = await requireModuleEnabledForUser(user.id, moduleSlug);
  if (!entitlement.ok) throw new Error(`${moduleLabel} isn't included in your organisation's plan.`);

  const organisation = await getUserOrganisation(user.id);
  if (!organisation || organisation.role !== "admin") {
    throw new Error("Only organisation admins can manage this connection.");
  }
  return { userId: user.id, organisationId: organisation.organisationId };
}

/**
 * Platform-wide guard for a module's read-only Server Actions - available to any
 * organisation member, not just admins (a narrower check than requireOrganisationAdmin
 * above). See the module-access.ts doc comment above for why modules/wordpress/actions.ts
 * doesn't currently use this.
 */
export async function requireOrganisationMember(moduleSlug: ModuleSlug, moduleLabel: string): Promise<AuthorisedActor> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be logged in.");

  const entitlement = await requireModuleEnabledForUser(user.id, moduleSlug);
  if (!entitlement.ok) throw new Error(`${moduleLabel} isn't included in your organisation's plan.`);

  return { userId: user.id, organisationId: entitlement.organisationId };
}
