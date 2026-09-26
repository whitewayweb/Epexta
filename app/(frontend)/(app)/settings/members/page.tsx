import { Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { getOrganisationMembers, getUserOrganisation } from "@/lib/organisation";
import { requireUser } from "@/lib/session";
import { MembersPanel } from "@/modules/wordpress/MembersPanel";

const MEMBERS_PATH = "/settings/members";

export default async function MembersSettingsPage() {
  const user = await requireUser(MEMBERS_PATH);
  const organisation = await getUserOrganisation(user.id);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Members"
        description="Admins manage sites, members and connections. Members use the organisation's connections from their own AI apps."
      />

      {organisation?.role === "admin" ? (
        <MembersPanel members={await getOrganisationMembers(organisation.organisationId)} currentUserId={String(user.id)} />
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users />
            </EmptyMedia>
            <EmptyTitle>{organisation ? "Only admins can manage members" : "You're not in an organisation yet"}</EmptyTitle>
            <EmptyDescription>
              {organisation
                ? "Ask an admin in your organisation to invite or remove people."
                : "Add a WordPress site to create your organisation, then invite your team."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
