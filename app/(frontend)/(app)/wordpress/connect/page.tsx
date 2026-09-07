import { getUserOrganisation } from "@/lib/organisation";
import { requireUser } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiKeyPanel } from "@/modules/wordpress/ApiKeyPanel";
import { ConnectionForm } from "@/modules/wordpress/ConnectionForm";
import { ConnectionsList, type DisplayConnection } from "@/modules/wordpress/ConnectionsList";
import { listWordPressConnections } from "@/modules/wordpress/organisation";

const CONNECT_PATH = "/wordpress/connect";

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const user = await requireUser(CONNECT_PATH);
  const { edit } = await searchParams;

  const organisation = await getUserOrganisation(user.id);
  const connections = organisation ? await listWordPressConnections(organisation.organisationId) : [];
  // Application Passwords never leave the server - strip them before handing the list to
  // the client component that renders it.
  const displayConnections: DisplayConnection[] = connections.map(
    ({ connectionId, label, siteUrl, username }) => ({ connectionId, label, siteUrl, username })
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">Connect your WordPress sites</h1>

      {!organisation && (
        <Card>
          <CardHeader>
            <CardTitle>Connect your first site</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You don&apos;t have a WordPress site connected yet. Add one below and you&apos;ll become its admin.
              You&apos;ll be able to connect more sites afterwards.
            </p>
            <ConnectionForm mode="add" />
          </CardContent>
        </Card>
      )}

      {organisation && organisation.role === "admin" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Connected sites</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <ConnectionsList connections={displayConnections} initialEditId={edit} />
              <div className="border-t border-border/60 pt-6">
                <h3 className="mb-3 text-sm font-medium">Add another site</h3>
                <ConnectionForm mode="add" />
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {organisation && organisation.role === "member" && (
        <Card>
          <CardHeader>
            <CardTitle>Connected sites</CardTitle>
          </CardHeader>
          <CardContent>
            {displayConnections.length > 0 ? (
              <>
                <p className="mb-3 text-sm text-muted-foreground">
                  Only the organisation admin can add, change, or remove a site connection.
                </p>
                <ul className="max-w-md divide-y divide-border/60">
                  {displayConnections.map((c) => (
                    <li key={c.connectionId} className="py-2 text-sm">
                      <span className="font-medium text-foreground">{c.label || c.siteUrl}</span>
                      {c.label && <span className="text-muted-foreground"> — {c.siteUrl}</span>}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Your organisation admin hasn&apos;t connected a WordPress site yet.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your API key</CardTitle>
        </CardHeader>
        <CardContent>
          <ApiKeyPanel />
        </CardContent>
      </Card>
    </div>
  );
}
