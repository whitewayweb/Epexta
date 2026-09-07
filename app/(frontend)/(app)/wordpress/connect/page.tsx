import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  const organisation = await getUserOrganisation(user.id);
  // Members can't add, edit, or remove a connection - nothing for them to do on this page.
  if (organisation && organisation.role !== "admin") {
    redirect(OVERVIEW_PATH);
  }

  const editingConnection = edit && organisation ? await getWordPressConnection(organisation.organisationId, edit) : null;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <Link
        href={OVERVIEW_PATH}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Connected sites
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">
        {editingConnection ? "Edit connection" : "Add a WordPress site"}
      </h1>

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
