import { getCurrentUser } from "@/lib/session";
import { getOrganisationMembers, getUserOrganisation } from "@/lib/organisation";
import { ApiKeyPanel } from "@/modules/wordpress/ApiKeyPanel";
import { AuthForm } from "@/modules/wordpress/AuthForm";
import { ConnectionForm } from "@/modules/wordpress/ConnectionForm";
import { logoutAction } from "@/modules/wordpress/actions";
import { MembersPanel } from "@/modules/wordpress/MembersPanel";
import { getWordPressConnection } from "@/modules/wordpress/organisation";

export default async function ConnectPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Connect your WordPress site</h1>
        <p>Log in or create an account to connect your WordPress site and get an API key for ChatGPT.</p>
        <AuthForm />
      </main>
    );
  }

  const organisation = await getUserOrganisation(user.id);
  const connection = organisation ? await getWordPressConnection(organisation.organisationId) : null;

  return (
    <main style={{ padding: 24, display: "flex", flexDirection: "column", gap: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Connect your WordPress site</h1>
        <form action={logoutAction}>
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
