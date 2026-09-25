import { CopyButton } from "@/components/copy-button";
import { ConnectedAppsTable } from "@/components/settings/connected-apps-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  const connectors = oauthProvider.listResources().filter((resource) =>
    resource.modules.some((module) => enabledModuleSlugs.includes(module.slug))
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">Connected apps</h1>

      <Card>
        <CardHeader>
          <CardTitle>Add Epexta to Claude or ChatGPT</CardTitle>
          <CardDescription>
            In Claude, go to Settings → Connectors → Add custom connector. In ChatGPT, add a new connector. Paste the
            URL below, then sign in to Epexta and approve when asked.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {connectors.length === 0 ? (
            <p className="text-sm text-muted-foreground">Your organisation&apos;s plan doesn&apos;t include any connectors yet.</p>
          ) : (
            connectors.map((connector) => (
              <div key={connector.mcpPath} className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">{connector.name}</span>
                <div className="flex items-center gap-2">
                  <code className="block flex-1 break-all rounded-md bg-muted px-3 py-2 font-mono text-sm text-foreground">
                    {connector.url}
                  </code>
                  <CopyButton value={connector.url} label={`Copy ${connector.name} connector URL`} />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your connected apps</CardTitle>
          <CardDescription>Disconnecting an app stops it from using Epexta straight away.</CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectedAppsTable initialApps={apps} scope="own" />
        </CardContent>
      </Card>

      {organisationApps && (
        <Card>
          <CardHeader>
            <CardTitle>Your organisation&apos;s connected apps</CardTitle>
            <CardDescription>
              Every member&apos;s connections, including yours. As an admin you can disconnect any of them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConnectedAppsTable initialApps={organisationApps} scope="organisation" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
