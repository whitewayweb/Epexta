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
import { listMappingsForOrganisation } from "@/modules/google-analytics/mappings";
import { MappingsTable } from "@/modules/google-connections/MappingsTable";
import { listWordPressConnections } from "@/modules/wordpress/organisation";

const OVERVIEW_PATH = "/google-analytics";
const CONNECT_PATH = "/google-analytics/connect";

export default async function GoogleAnalyticsOverviewPage() {
  const user = await requireUser(OVERVIEW_PATH);

  const entitlement = await requireModuleEnabledForUser(user.id, "google-analytics");
  if (!entitlement.ok && entitlement.reason === "not_enabled") {
    return <ModuleNotEnabled moduleName="Google Analytics" />;
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
        title="Google Analytics"
        description="Each WordPress site reports through its GA4 property. AI apps use this to answer questions about how readers engage with your posts."
        actions={
          <>
            {mappings.length > 0 && (
              <Button variant="outline" render={<Link href="/google-analytics/performance" />}>
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
                  ? "Connect a Google account, then map each WordPress site to its GA4 property."
                  : "Your organisation admin hasn't set up Analytics reporting yet."}
            </EmptyDescription>
          </EmptyHeader>
          {isAdmin && (
            <EmptyContent>
              <Button render={<Link href={CONNECT_PATH} />}>Set up Analytics</Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <Card className="py-0">
          <MappingsTable
            propertyHeading="GA4 property"
            rows={mappings.map((mapping) => {
              const site = wordpressConnections.find((c) => c.connectionId === mapping.wordpressConnectionId);
              return {
                id: mapping.mappingId,
                siteLabel: site ? site.label || site.siteUrl : "Unknown site",
                property: mapping.ga4PropertyId,
                status: mapping.status,
              };
            })}
          />
        </Card>
      )}
    </div>
  );
}
