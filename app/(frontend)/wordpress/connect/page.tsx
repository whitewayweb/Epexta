import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { logoutAction } from "@/lib/auth-actions";
import { getOrganisationMembers, getUserOrganisation } from "@/lib/organisation";
import { ApiKeyPanel } from "@/modules/wordpress/ApiKeyPanel";
import { ConnectionForm } from "@/modules/wordpress/ConnectionForm";
import { MembersPanel } from "@/modules/wordpress/MembersPanel";
import { getWordPressConnection } from "@/modules/wordpress/organisation";

const CONNECT_PATH = "/wordpress/connect";

export default async function ConnectPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/login?redirectTo=${encodeURIComponent(CONNECT_PATH)}`);
  }

  const organisation = await getUserOrganisation(user.id);
  const connection = organisation ? await getWordPressConnection(organisation.organisationId) : null;

  return (
    <main style={{ padding: 24, display: "flex", flexDirection: "column", gap: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Connect your WordPress site</h1>
        <form action={logoutAction}>
          <input type="hidden" name="redirectTo" value={CONNECT_PATH} />
          <button type="submit">Log out ({user.email})</button>
        </form>
      </div>

      {!organisation && (
        <section>
          <p>You don&apos;t have a WordPress site connected yet. Add one below — you&apos;ll become its admin.</p>
          <ConnectionForm siteUrl="" username="" />
        </section>
      )}

      {organisation && organisation.role === "admin" && (
        <>
          <section>
            <h2>Connection</h2>
            <ConnectionForm siteUrl={connection?.siteUrl ?? ""} username={connection?.username ?? ""} />
          </section>
          <section>
            <h2>Members</h2>
            <MembersPanel members={await getOrganisationMembers(organisation.organisationId)} />
          </section>
        </>
      )}

      {organisation && organisation.role === "member" && (
        <section>
          <h2>Connection</h2>
          {connection ? (
            <p>
              Connected to <strong>{connection.siteUrl}</strong>. Only the organisation admin can change the site or
              Application Password.
            </p>
          ) : (
            <p>Your organisation admin hasn&apos;t connected a WordPress site yet.</p>
          )}
        </section>
      )}

      <section>
        <h2>Your API key</h2>
        <ApiKeyPanel />
      </section>
    </main>
  );
}
