import Link from "next/link";
import { ModuleNotEnabled } from "@/components/module-not-enabled";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { requireModuleEnabledForUser } from "@/lib/entitlements";
import { getUserOrganisation } from "@/lib/organisation";
import { requireUser } from "@/lib/session";
import { listMappingsForOrganisation } from "@/modules/google-search-console/mappings";
import { PerformanceLookupForm } from "@/modules/google-connections/PerformanceLookupForm";
import { getPerformanceAction } from "@/modules/google-search-console/actions";
import { listWordPressConnections } from "@/modules/wordpress/organisation";

const OVERVIEW_PATH = "/google-search-console/performance";
const MODULE_PATH = "/google-search-console";

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

  const siteLabel = (connectionId: string) => {
    const site = wordpressConnections.find((connection) => connection.connectionId === connectionId);
    return site ? site.label || site.siteUrl : "Unknown site";
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: MODULE_PATH, label: "Google Search Console" }}
        title="Post performance"
        description="The numbers for one post, the same ones your AI apps see when they ask Google Search Console."
      />
      {mappings.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No site is mapped to a Search Console property yet.</EmptyTitle>
            <EmptyDescription>Map a site from the Google Search Console page first.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" render={<Link href={MODULE_PATH} />}>
              Go to Google Search Console
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <PerformanceLookupForm
          sites={mappings.map((mapping) => ({ id: mapping.wordpressConnectionId, label: siteLabel(mapping.wordpressConnectionId) }))}
          action={getPerformanceAction}
          metrics={[
            { key: "clicks", label: "Clicks", format: "count" },
            { key: "impressions", label: "Impressions", format: "count" },
            { key: "ctr", label: "CTR", format: "percent" },
            { key: "position", label: "Avg. position", format: "decimal" },
          ]}
        />
      )}
    </div>
  );
}
