import { Plus } from "lucide-react";
import Link from "next/link";
import { ModuleNotEnabled } from "@/components/module-not-enabled";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireModuleEnabledForUser } from "@/lib/entitlements";
import { getUserOrganisation } from "@/lib/organisation";
import { requireUser } from "@/lib/session";
import { listMappingsForOrganisation } from "@/modules/google-search-console/mappings";
import { listWordPressConnections } from "@/modules/wordpress/organisation";

const OVERVIEW_PATH = "/google-search-console";
const CONNECT_PATH = "/google-search-console/connect";

export default async function GoogleSearchConsoleOverviewPage() {
  const user = await requireUser(OVERVIEW_PATH);

  const entitlement = await requireModuleEnabledForUser(user.id, "google-search-console");
  if (!entitlement.ok && entitlement.reason === "not_enabled") {
    return <ModuleNotEnabled moduleName="Google Search Console" />;
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
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Google Search Console</h1>
        <div className="flex items-center gap-2">
          {mappings.length > 0 && (
            <Button variant="outline" render={<Link href="/google-search-console/performance" />}>
              View performance
            </Button>
          )}
          {isAdmin && (
            <Button render={<Link href={CONNECT_PATH} />}>
              <Plus />
              Manage connection
            </Button>
          )}
        </div>
      </div>

      {mappings.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {!organisation ? (
              "You're not part of an organisation yet."
            ) : isAdmin ? (
              <>
                No site mapped to a Search Console property yet.{" "}
                <Link href={CONNECT_PATH} className="text-primary underline underline-offset-4">
                  Set one up
                </Link>
                .
              </>
            ) : (
              "Your organisation admin hasn't set up Search Console reporting yet."
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mappings.map((mapping) => {
            const site = wordpressConnections.find((c) => c.connectionId === mapping.wordpressConnectionId);
            return (
              <Card key={mapping.mappingId}>
                <CardContent className="flex flex-col gap-2 py-4">
                  <span className="text-sm font-medium">{site ? site.label || site.siteUrl : "Unknown site"}</span>
                  <span className="text-xs text-muted-foreground">{mapping.searchConsolePropertyUrl}</span>
                  <Badge variant={mapping.status === "active" ? "default" : "destructive"} className="w-fit">
                    {mapping.status.replace("_", " ")}
                  </Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
