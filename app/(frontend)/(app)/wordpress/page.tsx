import { Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getUserOrganisation } from "@/lib/organisation";
import { requireUser } from "@/lib/session";
import { listWordPressConnections } from "@/modules/wordpress/organisation";
import { SiteCard } from "@/modules/wordpress/SiteCard";

const OVERVIEW_PATH = "/wordpress";
const ADD_SITE_PATH = "/wordpress/connect";

export default async function WordPressOverviewPage() {
  const user = await requireUser(OVERVIEW_PATH);
  const organisation = await getUserOrganisation(user.id);
  const connections = organisation ? await listWordPressConnections(organisation.organisationId) : [];
  const isAdmin = organisation?.role === "admin";
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
        {isAdmin && (
          <Button render={<Link href={ADD_SITE_PATH} />}>
            <Plus />
            Add WordPress site
          </Button>
        )}
      </div>

      {sites.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {!organisation ? (
              <>
                You&apos;re not part of an organisation yet.{" "}
                <Link href={ADD_SITE_PATH} className="text-primary underline underline-offset-4">
                  Get started
                </Link>
                .
              </>
            ) : isAdmin ? (
              <>
                No WordPress sites connected yet.{" "}
                <Link href={ADD_SITE_PATH} className="text-primary underline underline-offset-4">
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
          {sites.map((site) => (
            <SiteCard key={site.connectionId} site={site} editable={isAdmin} />
          ))}
        </div>
      )}
    </div>
  );
}
