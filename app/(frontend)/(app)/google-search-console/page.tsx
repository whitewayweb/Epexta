import { ChartColumn, Settings2 } from "lucide-react";
import Link from "next/link";
import { ModuleNotEnabled } from "@/components/module-not-enabled";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { requireModuleEnabledForUser } from "@/lib/entitlements";
import { getUserOrganisation } from "@/lib/organisation";
import { requireUser } from "@/lib/session";
import { listMappingsForOrganisation } from "@/modules/google-search-console/mappings";
import { MappingsTable } from "@/modules/google-connections/MappingsTable";
import { listWordPressConnections } from "@/modules/wordpress/organisation";

const OVERVIEW_PATH = "/google-search-console";
const CONNECT_PATH = "/google-search-console/connect";

export default async function GoogleSearchConsoleOverviewPage() {
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
  const isAdmin = organisation?.role === "admin";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Google Search Console"
        description="Each WordPress site reports through the Search Console property that covers it. AI apps use this to answer questions about your posts' search performance."
        actions={
          <>
            {mappings.length > 0 && (
              <Button variant="outline" render={<Link href="/google-search-console/performance" />}>
                <ChartColumn />
                Post performance
              </Button>
            )}
            {isAdmin && (
              <Button render={<Link href={CONNECT_PATH} />}>
                <Settings2 />
                Manage connection
              </Button>
            )}
          </>
        }
      />

      {mappings.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ChartColumn />
            </EmptyMedia>
            <EmptyTitle>No sites mapped yet</EmptyTitle>
            <EmptyDescription>
              {!organisation
                ? "You're not part of an organisation yet."
                : isAdmin
                  ? "Connect a Google account, then map each WordPress site to its Search Console property."
                  : "Your organisation admin hasn't set up Search Console reporting yet."}
            </EmptyDescription>
          </EmptyHeader>
          {isAdmin && (
            <EmptyContent>
              <Button render={<Link href={CONNECT_PATH} />}>Set up Search Console</Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <Card className="py-0">
          <MappingsTable
            propertyHeading="Search Console property"
            rows={mappings.map((mapping) => {
              const site = wordpressConnections.find((c) => c.connectionId === mapping.wordpressConnectionId);
              return {
                id: mapping.mappingId,
                siteLabel: site ? site.label || site.siteUrl : "Unknown site",
                property: mapping.searchConsolePropertyUrl,
                status: mapping.status,
              };
            })}
          />
        </Card>
      )}
    </div>
  );
}
