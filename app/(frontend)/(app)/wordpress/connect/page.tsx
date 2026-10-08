import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ModuleNotEnabled } from "@/components/module-not-enabled";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { requireModuleEnabledForUser } from "@/lib/entitlements";
import { getUserOrganisation } from "@/lib/organisation";
import { requireUser } from "@/lib/session";
import { ConnectionForm } from "@/modules/wordpress/ConnectionForm";
import { getOwnedWordPressConnection, getSiteLimitState } from "@/modules/wordpress/organisation";
import { SOCIAL_PUBLISHER_DESCRIPTION, SOCIAL_PUBLISHER_TITLE, SOCIAL_PUBLISHER_URL } from "@/modules/wordpress/social-publisher";

const CONNECT_PATH = "/wordpress/connect";
const OVERVIEW_PATH = "/wordpress";
const UPGRADE_PATH = "/settings/plan";

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const user = await requireUser(CONNECT_PATH);
  const { edit } = await searchParams;

  // A user with no organisation at all is rare (signupAction already creates one) but
  // still needs the ordinary connect form, not this "not included" message - only an
  // org that exists and lacks the entitlement sees it.
  const entitlement = await requireModuleEnabledForUser(user.id, "wordpress");
  if (!entitlement.ok && entitlement.reason === "not_enabled") {
    return <ModuleNotEnabled moduleName="WordPress" />;
  }

  const organisation = await getUserOrganisation(user.id);
  // Members can't add, edit, or remove a connection - nothing for them to do on this page.
  if (organisation && organisation.role !== "admin") {
    redirect(OVERVIEW_PATH);
  }

  const editingConnection = edit && organisation ? await getOwnedWordPressConnection(organisation.organisationId, user.id, edit) : null;

  // A new site past the plan's limit is refused by the action; offer the upgrade instead of a
  // form that can't succeed. Editing an existing connection is never limited.
  const siteLimit = !editingConnection && organisation ? await getSiteLimitState(organisation.organisationId) : null;
  if (siteLimit?.reached) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <PageHeader back={{ href: OVERVIEW_PATH, label: "WordPress sites" }} title="Add a WordPress site" />
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Your {siteLimit.plan.name} plan&apos;s site limit is reached</EmptyTitle>
            <EmptyDescription>
              It includes {siteLimit.plan.maxSites} connected {siteLimit.plan.maxSites === 1 ? "site" : "sites"}. Upgrade to connect more.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button render={<Link href={UPGRADE_PATH} />}>Upgrade</Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        back={{ href: OVERVIEW_PATH, label: "WordPress sites" }}
        title={editingConnection ? "Edit connection" : "Add a WordPress site"}
        description="Epexta signs in to WordPress with an Application Password, which you can create under Users → Profile in your WordPress admin."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>{editingConnection ? editingConnection.label || editingConnection.siteUrl : "Site details"}</CardTitle>
          </CardHeader>
          <CardContent>
            {editingConnection ? (
              <ConnectionForm
                // Remounts whenever a save changes the underlying values, so the (uncontrolled)
                // inputs re-initialize from the new defaults instead of warning about it.
                key={`${editingConnection.connectionId}:${editingConnection.label}:${editingConnection.siteUrl}:${editingConnection.username}`}
                mode="edit"
                connectionId={editingConnection.connectionId}
                label={editingConnection.label}
                siteUrl={editingConnection.siteUrl}
                username={editingConnection.username}
              />
            ) : (
              <ConnectionForm mode="add" />
            )}
          </CardContent>
        </Card>
        {!editingConnection && (
          <Card>
            <CardHeader>
              <CardTitle>{SOCIAL_PUBLISHER_TITLE}</CardTitle>
              <CardDescription>{SOCIAL_PUBLISHER_DESCRIPTION}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" render={<a href={SOCIAL_PUBLISHER_URL} target="_blank" rel="noopener noreferrer" />}>
                View the plugin
                <ExternalLinkIcon data-icon="inline-end" />
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
