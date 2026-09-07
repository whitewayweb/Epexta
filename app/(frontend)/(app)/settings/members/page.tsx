import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrganisationMembers, getUserOrganisation } from "@/lib/organisation";
import { requireUser } from "@/lib/session";
import { MembersPanel } from "@/modules/wordpress/MembersPanel";

const MEMBERS_PATH = "/settings/members";

export default async function MembersSettingsPage() {
  const user = await requireUser(MEMBERS_PATH);
  const organisation = await getUserOrganisation(user.id);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">Members</h1>

      <Card>
        <CardHeader>
          <CardTitle>Organisation members</CardTitle>
        </CardHeader>
        <CardContent>
          {!organisation ? (
            <p className="text-sm text-muted-foreground">You&apos;re not part of an organisation yet.</p>
          ) : organisation.role === "admin" ? (
            <MembersPanel members={await getOrganisationMembers(organisation.organisationId)} />
          ) : (
            <p className="text-sm text-muted-foreground">Only organisation admins can manage members.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
