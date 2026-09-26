import { redirect } from "next/navigation";
import { ModuleNotEnabled } from "@/components/module-not-enabled";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireModuleEnabledForUser } from "@/lib/entitlements";
import { getUserOrganisation } from "@/lib/organisation";
import { requireUser } from "@/lib/session";
import { listConnectionsForCapability } from "@/modules/google-connections";
import { ConnectionsPanel } from "@/modules/google-connections/ConnectionsPanel";
import {
  connectGoogleAction,
  disconnectGoogleAction,
  reconnectGoogleAction,
  revokeGoogleAction,
} from "@/modules/google-search-console/actions";
import { MappingsTable } from "@/modules/google-connections/MappingsTable";
import { MappingForm } from "@/modules/google-search-console/MappingForm";
import { listMappingsForOrganisation } from "@/modules/google-search-console/mappings";
import { listWordPressConnections } from "@/modules/wordpress/organisation";

const CONNECT_PATH = "/google-search-console/connect";
const OVERVIEW_PATH = "/google-search-console";

export default async function GoogleSearchConsoleConnectPage() {
  const user = await requireUser(CONNECT_PATH);

  const entitlement = await requireModuleEnabledForUser(user.id, "google-search-console");
  if (!entitlement.ok && entitlement.reason === "not_enabled") {
    return <ModuleNotEnabled moduleName="Google Search Console" />;
  }

  const organisation = await getUserOrganisation(user.id);
  if (organisation && organisation.role !== "admin") {
    redirect(OVERVIEW_PATH);
  }
  if (!organisation) {
    return <ModuleNotEnabled moduleName="Google Search Console" />;
  }

  const [connections, wordpressConnections, mappings] = await Promise.all([
    listConnectionsForCapability(organisation.organisationId, "google-search-console"),
    listWordPressConnections(organisation.organisationId),
    listMappingsForOrganisation(organisation.organisationId),
  ]);

  // Application Passwords never leave the server - strip just that field.
  const sites = wordpressConnections.map(({ appPassword: _appPassword, ...rest }) => rest);
  const mappedConnectionIds = new Set(mappings.map((m) => m.wordpressConnectionId));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader
        back={{ href: OVERVIEW_PATH, label: "Google Search Console" }}
        title="Set up Google Search Console"
        description="Connect the Google account that can see your Search Console properties, then map each WordPress site to one."
      />

      <Card>
        <CardHeader>
          <CardTitle>Google account</CardTitle>
        </CardHeader>
        <CardContent>
          <ConnectionsPanel
            connections={connections}
            productName="Search Console"
            actions={{
              connect: connectGoogleAction,
              reconnect: reconnectGoogleAction,
              revoke: revokeGoogleAction,
              disconnect: disconnectGoogleAction,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Map a site to a property</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {mappings.length > 0 && (
            <div className="overflow-hidden rounded-lg border">
              <MappingsTable
                propertyHeading="Search Console property"
                rows={mappings.map((mapping) => {
                  const site = sites.find((s) => s.connectionId === mapping.wordpressConnectionId);
                  return {
                    id: mapping.mappingId,
                    siteLabel: site ? site.label || site.siteUrl : "Unknown site",
                    property: mapping.searchConsolePropertyUrl,
                    status: mapping.status,
                  };
                })}
              />
            </div>
          )}
          <MappingForm
            wordpressConnections={sites.filter((s) => !mappedConnectionIds.has(s.connectionId))}
            googleConnections={connections}
          />
        </CardContent>
      </Card>
    </div>
  );
}
