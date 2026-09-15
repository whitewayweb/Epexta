import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ModuleNotEnabled } from "@/components/module-not-enabled";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireModuleEnabledForUser } from "@/lib/entitlements";
import { getUserOrganisation } from "@/lib/organisation";
import { requireUser } from "@/lib/session";
import { listConnectionsForCapability } from "@/modules/google-connections";
import { ConnectionsPanel } from "@/modules/google-analytics/ConnectionsPanel";
import { MappingForm } from "@/modules/google-analytics/MappingForm";
import { listMappingsForOrganisation } from "@/modules/google-analytics/mappings";
import { listWordPressConnections } from "@/modules/wordpress/organisation";

const CONNECT_PATH = "/google-analytics/connect";
const OVERVIEW_PATH = "/google-analytics";

export default async function GoogleAnalyticsConnectPage() {
  const user = await requireUser(CONNECT_PATH);

  const entitlement = await requireModuleEnabledForUser(user.id, "google-analytics");
  if (!entitlement.ok && entitlement.reason === "not_enabled") {
    return <ModuleNotEnabled moduleName="Google Analytics" />;
  }

  const organisation = await getUserOrganisation(user.id);
  if (organisation && organisation.role !== "admin") {
    redirect(OVERVIEW_PATH);
  }
  if (!organisation) {
    return <ModuleNotEnabled moduleName="Google Analytics" />;
  }

  const [connections, wordpressConnections, mappings] = await Promise.all([
    listConnectionsForCapability(organisation.organisationId, "google-analytics"),
    listWordPressConnections(organisation.organisationId),
    listMappingsForOrganisation(organisation.organisationId),
  ]);

  // Application Passwords never leave the server - strip just that field.
  const sites = wordpressConnections.map(({ appPassword: _appPassword, ...rest }) => rest);
  const mappedConnectionIds = new Set(mappings.map((m) => m.wordpressConnectionId));

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <Link
        href={OVERVIEW_PATH}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Analytics overview
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">Connect Google Analytics</h1>

      <Card>
        <CardHeader>
          <CardTitle>Google account</CardTitle>
        </CardHeader>
        <CardContent>
          <ConnectionsPanel connections={connections} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Map a site to a property</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {mappings.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
              {mappings.map((mapping) => {
                const site = sites.find((s) => s.connectionId === mapping.wordpressConnectionId);
                return (
                  <li key={mapping.mappingId}>
                    {site ? site.label || site.siteUrl : "Unknown site"} → {mapping.ga4PropertyId}
                  </li>
                );
              })}
            </ul>
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
