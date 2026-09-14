import { ModuleNotEnabled } from "@/components/module-not-enabled";
import { requireModuleEnabledForUser } from "@/lib/entitlements";
import { getUserOrganisation } from "@/lib/organisation";
import { requireUser } from "@/lib/session";
import { listMappingsForOrganisation } from "@/modules/google-search-console/mappings";
import { PerformanceLookupForm } from "@/modules/google-search-console/PerformanceLookupForm";
import { listWordPressConnections } from "@/modules/wordpress/organisation";

const OVERVIEW_PATH = "/google-search-console/performance";

export default async function GoogleSearchConsolePerformancePage() {
  const user = await requireUser(OVERVIEW_PATH);

  const entitlement = await requireModuleEnabledForUser(user.id, "google-search-console");
  if (!entitlement.ok && entitlement.reason === "not_enabled") {
    return <ModuleNotEnabled moduleName="Google Search Console" />;
  }

  const organisation = await getUserOrganisation(user.id);
  const [mappings, wordpressConnections] = organisation
    ? await Promise.all([
        listMappingsForOrganisation(organisation.organisationId),
        listWordPressConnections(organisation.organisationId),
      ])
    : [[], []];

  const siteLabel = (wordpressConnectionId: string) => {
    const site = wordpressConnections.find((c) => c.connectionId === wordpressConnectionId);
    return site ? site.label || site.siteUrl : "Unknown site";
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Post performance</h1>
      {mappings.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No site is mapped to a Search Console property yet. Set one up from the Google Search Console overview page first.
        </p>
      ) : (
        <PerformanceLookupForm mappings={mappings} siteLabel={siteLabel} />
      )}
    </div>
  );
}
