import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getUserOrganisation } from "@/lib/organisation";
import { requireUser } from "@/lib/session";
import { listWordPressConnections } from "@/modules/wordpress/organisation";

const OVERVIEW_PATH = "/wordpress";

export default async function WordPressOverviewPage() {
  const user = await requireUser(OVERVIEW_PATH);
  const organisation = await getUserOrganisation(user.id);
  const connections = organisation ? await listWordPressConnections(organisation.organisationId) : [];
  // Application Passwords never leave the server - only pull the fields this page displays.
  const sites = connections.map(({ connectionId, label, siteUrl, username }) => ({
    connectionId,
    label,
    siteUrl,
    username,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Connected sites</h1>
        {organisation?.role === "admin" && (
          <Button render={<Link href="/wordpress/connect" />}>Manage connections</Button>
        )}
      </div>

      {sites.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {!organisation ? (
              <>
                You&apos;re not part of an organisation yet.{" "}
                <Link href="/wordpress/connect" className="text-primary underline underline-offset-4">
                  Get started
                </Link>
                .
              </>
            ) : organisation.role === "admin" ? (
              <>
                No WordPress sites connected yet.{" "}
                <Link href="/wordpress/connect" className="text-primary underline underline-offset-4">
                  Connect one
                </Link>
                .
              </>
            ) : (
              "Your organisation admin hasn't connected a WordPress site yet."
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sites.map((site) => {
            const card = (
              <Card
                className={
                  organisation?.role === "admin" ? "transition-colors hover:bg-accent/40" : undefined
                }
              >
                <CardHeader>
                  <CardTitle className="text-base">{site.label || site.siteUrl}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm text-muted-foreground">
                  <p>{site.siteUrl}</p>
                  <p>{site.username}</p>
                </CardContent>
              </Card>
            );

            return organisation?.role === "admin" ? (
              <Link key={site.connectionId} href={`/wordpress/connect?edit=${site.connectionId}`}>
                {card}
              </Link>
            ) : (
              <div key={site.connectionId}>{card}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
