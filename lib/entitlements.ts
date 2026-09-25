import { getUserOrganisation } from "./organisation";
import { getPayloadClient } from "./payload";
import { MODULE_SLUGS, type ModuleSlug } from "./modules";

/**
 * Every module slug currently enabled for this organisation, filtered against the
 * live registry (lib/modules.ts) so a retired/renamed slug can never leak through as
 * enabled just because a stale row is still in the database.
 *
 * overrideAccess: true is safe here only because organisationId must already have
 * been derived from authenticated server-side context (e.g. getUserOrganisation) before
 * this is called - never pass through a client-supplied organisation id.
 */
export async function getEnabledModules(organisationId: string): Promise<ModuleSlug[]> {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "module-entitlements",
    where: {
      organisation: { equals: organisationId },
      enabled: { equals: true },
    },
    limit: 0,
    overrideAccess: true,
  });

  const slugs = new Set<string>(MODULE_SLUGS);
  return result.docs.map((doc) => doc.moduleSlug).filter((slug): slug is ModuleSlug => slugs.has(slug));
}

/** The entitlement primitive. Every other helper below is a thin wrapper around this. */
export async function isModuleEnabled(organisationId: string, slug: ModuleSlug): Promise<boolean> {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "module-entitlements",
    where: {
      organisation: { equals: organisationId },
      moduleSlug: { equals: slug },
      enabled: { equals: true },
    },
    limit: 1,
    overrideAccess: true,
  });
  return result.docs.length > 0;
}

export type RequireModuleEnabledResult =
  | { ok: true; organisationId: string }
  | { ok: false; reason: "no_org" | "not_enabled" };

/**
 * Convenience wrapper for pages/Server Actions, which have a userId rather than an
 * organisationId in hand. Resolves the user's current organisation (single-org-per-user,
 * same assumption as lib/organisation.ts) and delegates to isModuleEnabled - not a second,
 * parallel entitlement path.
 */
export async function requireModuleEnabledForUser(
  userId: string,
  slug: ModuleSlug
): Promise<RequireModuleEnabledResult> {
  const organisation = await getUserOrganisation(userId);
  if (!organisation) return { ok: false, reason: "no_org" };

  const enabled = await isModuleEnabled(organisation.organisationId, slug);
  if (!enabled) return { ok: false, reason: "not_enabled" };

  return { ok: true, organisationId: organisation.organisationId };
}

export class ModuleNotEnabledError extends Error {
  constructor(slug: ModuleSlug) {
    super(`The "${slug}" module is not included in your organisation's plan.`);
    this.name = "ModuleNotEnabledError";
  }
}

/**
 * For MCP tool handlers, via registerGatedTool. Reads the moduleEnabled flag computed
 * once per request in the route's buildExtra (see withEpextaMcpAuth in lib/mcp-auth.ts)
 * rather than re-querying the database per tool call.
 */
export function assertModuleEnabled(moduleEnabled: boolean, slug: ModuleSlug): void {
  if (!moduleEnabled) throw new ModuleNotEnabledError(slug);
}
