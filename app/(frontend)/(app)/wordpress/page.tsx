import { ArrowUpCircle, ExternalLinkIcon, Plus, Share2 } from "lucide-react";
import Link from "next/link";
import { ModuleNotEnabled } from "@/components/module-not-enabled";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { WordPressIcon } from "@/components/site/wordpress-icon";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { requireModuleEnabledForUser } from "@/lib/entitlements";
import { getUserOrganisation } from "@/lib/organisation";
import { requireUser } from "@/lib/auth/session";
import { getSiteLimitState, listWordPressConnections } from "@/modules/wordpress/organisation";
import { SitesTable } from "@/modules/wordpress/SitesTable";
import { SOCIAL_PUBLISHER_DESCRIPTION, SOCIAL_PUBLISHER_TITLE, SOCIAL_PUBLISHER_URL } from "@/modules/wordpress/social-publisher";

const OVERVIEW_PATH = "/wordpress";
const ADD_SITE_PATH = "/wordpress/connect";
const UPGRADE_PATH = "/settings/plan";

export default async function WordPressOverviewPage() {
  const user = await requireUser(OVERVIEW_PATH);

  const entitlement = await requireModuleEnabledForUser(user.id, "wordpress");
  if (!entitlement.ok && entitlement.reason === "not_enabled") {
    return <ModuleNotEnabled moduleName="WordPress" />;
  }

  const organisation = await getUserOrganisation(user.id);
  const connections = organisation ? await listWordPressConnections(organisation.organisationId, user.id) : [];
  const isAdmin = organisation?.role === "admin";
  // At the plan's site limit the add button becomes an upgrade button.
  const siteLimitReached = organisation && isAdmin ? (await getSiteLimitState(organisation.organisationId)).reached : false;
  const addSiteButton = siteLimitReached ? (
    <Button render={<Link href={UPGRADE_PATH} />}>
      <ArrowUpCircle />
      Upgrade to add more sites
    </Button>
  ) : (
    <Button render={<Link href={ADD_SITE_PATH} />}>
      <Plus />
      {organisation ? "Add WordPress site" : "Get started"}
    </Button>
  );
  // Application Passwords never leave the server - strip just that field.
  const sites = connections.map(({ appPassword: _appPassword, ...rest }) => rest);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="WordPress sites"
        description={
          isAdmin
            ? "Sites you connected for Epexta to publish to. They are private to you; each admin connects their own."
            : "Sites you connected for Epexta to publish to. Only organisation admins can connect a site."
        }
        actions={
          isAdmin && sites.length > 0 && addSiteButton
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
            <EmptyContent>{addSiteButton}</EmptyContent>
          )}
        </Empty>
      ) : (
        <>
          <SitesTable sites={sites} editable={isAdmin} />
          <Alert>
            <Share2 />
            <AlertTitle>{SOCIAL_PUBLISHER_TITLE}</AlertTitle>
            <AlertDescription>
              {SOCIAL_PUBLISHER_DESCRIPTION}{" "}
              <a href={SOCIAL_PUBLISHER_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1">
                View the plugin
                <ExternalLinkIcon className="size-3" />
              </a>
            </AlertDescription>
          </Alert>
        </>
      )}
    </div>
  );
}
