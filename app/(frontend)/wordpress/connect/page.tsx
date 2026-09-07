import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { logoutAction } from "@/lib/auth-actions";
import { getOrganisationMembers, getUserOrganisation } from "@/lib/organisation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiKeyPanel } from "@/modules/wordpress/ApiKeyPanel";
import { ConnectionForm } from "@/modules/wordpress/ConnectionForm";
import { MembersPanel } from "@/modules/wordpress/MembersPanel";
import { getWordPressConnection } from "@/modules/wordpress/organisation";

const CONNECT_PATH = "/wordpress/connect";

export default async function ConnectPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/login?redirectTo=${encodeURIComponent(CONNECT_PATH)}`);
  }

  const organisation = await getUserOrganisation(user.id);
  const connection = organisation ? await getWordPressConnection(organisation.organisationId) : null;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Connect your WordPress site</h1>
        <form action={logoutAction}>
          <input type="hidden" name="redirectTo" value={CONNECT_PATH} />
          <Button type="submit" variant="outline" size="sm">
            Log out ({user.email})
          </Button>
        </form>
      </div>

      {!organisation && (
        <Card>
          <CardHeader>
            <CardTitle>Connect your site</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You don&apos;t have a WordPress site connected yet. Add one below — you&apos;ll become its admin.
            </p>
            <ConnectionForm siteUrl="" username="" />
          </CardContent>
        </Card>
      )}

      {organisation && organisation.role === "admin" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Connection</CardTitle>
            </CardHeader>
            <CardContent>
              <ConnectionForm siteUrl={connection?.siteUrl ?? ""} username={connection?.username ?? ""} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Members</CardTitle>
            </CardHeader>
            <CardContent>
              <MembersPanel members={await getOrganisationMembers(organisation.organisationId)} />
            </CardContent>
          </Card>
        </>
      )}

      {organisation && organisation.role === "member" && (
        <Card>
          <CardHeader>
            <CardTitle>Connection</CardTitle>
          </CardHeader>
          <CardContent>
            {connection ? (
              <p className="text-sm text-muted-foreground">
                Connected to <span className="font-medium text-foreground">{connection.siteUrl}</span>. Only the
                organisation admin can change the site or Application Password.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Your organisation admin hasn&apos;t connected a WordPress site yet.</p>
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
    </main>
  );
}
