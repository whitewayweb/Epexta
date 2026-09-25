import { ConnectedApps } from "@/components/settings/connected-apps";
import { ConnectAppDialog, type ConnectorLink } from "@/components/settings/connector-setup";
import { Card, CardContent } from "@/components/ui/card";
import { getEnabledModules } from "@/lib/entitlements";
import { oauthProvider } from "@/lib/oauth/provider";
import { getUserOrganisation } from "@/lib/organisation";
import { requireUser } from "@/lib/session";

const CONNECTED_APPS_PATH = "/settings/connected-apps";

export default async function ConnectedAppsPage() {
  const user = await requireUser(CONNECTED_APPS_PATH);
  const organisation = await getUserOrganisation(user.id);
  const [apps, enabledModuleSlugs, organisationApps] = await Promise.all([
    oauthProvider.listConnectedApps(user.id),
    organisation ? getEnabledModules(organisation.organisationId) : Promise.resolve([]),
    // Null unless the user is an admin of the organisation (checked by the provider).
    organisation ? oauthProvider.listOrganisationConnectedApps(user.id, organisation.organisationId) : null,
  ]);

  // Only connectors the organisation's plan includes - the MCP route would refuse the rest anyway.
  const connectors: ConnectorLink[] = oauthProvider
    .listResources()
    .filter((resource) => resource.modules.some((module) => enabledModuleSlugs.includes(module.slug)))
    .map((resource) => ({ name: resource.name, url: resource.url, slug: resource.mcpPath.split("/")[2] ?? "mcp" }));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Connected apps</h1>
          <p className="text-sm text-muted-foreground">
            Apps using Epexta on your behalf. Disconnecting one stops it straight away.
          </p>
        </div>
        {connectors.length > 0 && <ConnectAppDialog connectors={connectors} />}
      </div>

      <Card>
        <CardContent>
          <ConnectedApps
            ownApps={apps}
            organisationApps={organisationApps}
            currentUserId={String(user.id)}
            connectors={connectors}
          />
        </CardContent>
      </Card>
    </div>
  );
}
