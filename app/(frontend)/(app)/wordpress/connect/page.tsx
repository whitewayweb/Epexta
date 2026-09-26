import { redirect } from "next/navigation";
import { ModuleNotEnabled } from "@/components/module-not-enabled";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireModuleEnabledForUser } from "@/lib/entitlements";
import { getUserOrganisation } from "@/lib/organisation";
import { requireUser } from "@/lib/session";
import { ConnectionForm } from "@/modules/wordpress/ConnectionForm";
import { getWordPressConnection } from "@/modules/wordpress/organisation";

const CONNECT_PATH = "/wordpress/connect";
const OVERVIEW_PATH = "/wordpress";

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

  const editingConnection = edit && organisation ? await getWordPressConnection(organisation.organisationId, edit) : null;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <PageHeader
        back={{ href: OVERVIEW_PATH, label: "WordPress sites" }}
        title={editingConnection ? "Edit connection" : "Add a WordPress site"}
        description="Epexta signs in to WordPress with an Application Password, which you can create under Users → Profile in your WordPress admin."
      />

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
    </div>
  );
}
