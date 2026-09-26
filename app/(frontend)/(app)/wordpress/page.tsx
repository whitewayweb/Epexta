import { Plus } from "lucide-react";
import Link from "next/link";
import { ModuleNotEnabled } from "@/components/module-not-enabled";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { WordPressIcon } from "@/components/site/wordpress-icon";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { requireModuleEnabledForUser } from "@/lib/entitlements";
import { getUserOrganisation } from "@/lib/organisation";
import { requireUser } from "@/lib/session";
import { listWordPressConnections } from "@/modules/wordpress/organisation";
import { SiteCard } from "@/modules/wordpress/SiteCard";

const OVERVIEW_PATH = "/wordpress";
const ADD_SITE_PATH = "/wordpress/connect";

export default async function WordPressOverviewPage() {
  const user = await requireUser(OVERVIEW_PATH);

  const entitlement = await requireModuleEnabledForUser(user.id, "wordpress");
  if (!entitlement.ok && entitlement.reason === "not_enabled") {
    return <ModuleNotEnabled moduleName="WordPress" />;
  }

  const organisation = await getUserOrganisation(user.id);
  const connections = organisation ? await listWordPressConnections(organisation.organisationId) : [];
  const isAdmin = organisation?.role === "admin";
  // Application Passwords never leave the server - strip just that field.
  const sites = connections.map(({ appPassword: _appPassword, ...rest }) => rest);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="WordPress sites"
        description={
          isAdmin
            ? "Sites Epexta can publish to. Everyone in your organisation can use them from their AI apps; only admins can add or change one."
            : "Sites Epexta can publish to. You can use them from your AI apps; an admin manages the connections."
        }
        actions={
          isAdmin &&
          sites.length > 0 && (
            <Button render={<Link href={ADD_SITE_PATH} />}>
              <Plus />
              Add WordPress site
            </Button>
          )
        }
      />

      {sites.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <WordPressIcon />
            </EmptyMedia>
            <EmptyTitle>No WordPress sites yet</EmptyTitle>
            <EmptyDescription>
              {!organisation
                ? "You're not part of an organisation yet."
                : isAdmin
                  ? "Connect a site with a WordPress Application Password so your AI apps can publish to it."
                  : "Your organisation admin hasn't connected a WordPress site yet."}
            </EmptyDescription>
          </EmptyHeader>
          {(!organisation || isAdmin) && (
            <EmptyContent>
              <Button render={<Link href={ADD_SITE_PATH} />}>
                <Plus />
                {organisation ? "Add WordPress site" : "Get started"}
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sites.map((site) => (
            <SiteCard key={site.connectionId} site={site} editable={isAdmin} />
          ))}
        </div>
      )}
    </div>
  );
}
