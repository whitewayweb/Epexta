import Link from "next/link";
import { ModuleNotEnabled } from "@/components/module-not-enabled";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { requireModuleEnabledForUser } from "@/lib/entitlements";
import { getUserOrganisation } from "@/lib/organisation";
import { requireUser } from "@/lib/session";
import { listMappingsForOrganisation } from "@/modules/google-analytics/mappings";
import { PerformanceLookupForm } from "@/modules/google-connections/PerformanceLookupForm";
import { getPerformanceAction } from "@/modules/google-analytics/actions";
import { listWordPressConnections } from "@/modules/wordpress/organisation";

const OVERVIEW_PATH = "/google-analytics/performance";
const MODULE_PATH = "/google-analytics";

export default async function GoogleAnalyticsPerformancePage() {
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

  const siteLabel = (connectionId: string) => {
    const site = wordpressConnections.find((connection) => connection.connectionId === connectionId);
    return site ? site.label || site.siteUrl : "Unknown site";
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: MODULE_PATH, label: "Google Analytics" }}
        title="Post performance"
        description="The numbers for one post, the same ones your AI apps see when they ask Google Analytics."
      />
      {mappings.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No site is mapped to a GA4 property yet.</EmptyTitle>
            <EmptyDescription>Map a site from the Google Analytics page first.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" render={<Link href={MODULE_PATH} />}>
              Go to Google Analytics
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <PerformanceLookupForm
          sites={mappings.map((mapping) => ({ id: mapping.wordpressConnectionId, label: siteLabel(mapping.wordpressConnectionId) }))}
          action={getPerformanceAction}
          metrics={[
            { key: "activeUsers", label: "Active users", format: "count" },
            { key: "sessions", label: "Sessions", format: "count" },
            { key: "engagedSessions", label: "Engaged sessions", format: "count" },
            { key: "keyEvents", label: "Key events", format: "count" },
          ]}
        />
      )}
    </div>
  );
}
