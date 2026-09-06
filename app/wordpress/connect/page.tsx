import { getCurrentUser } from "@/lib/session";
import { ApiKeyPanel } from "@/modules/wordpress/ApiKeyPanel";
import { AuthForm } from "@/modules/wordpress/AuthForm";
import { ConnectionForm } from "@/modules/wordpress/ConnectionForm";
import { logoutAction } from "@/modules/wordpress/actions";
import { MembersPanel } from "@/modules/wordpress/MembersPanel";
import { getPopulatedMembers, getTenantContext } from "@/modules/wordpress/tenant";

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

  const tenant = await getTenantContext(user.id);

  return (
    <main style={{ padding: 24, display: "flex", flexDirection: "column", gap: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Connect your WordPress site</h1>
        <form action={logoutAction}>
          <button type="submit">Log out ({user.email})</button>
        </form>
      </div>

      {!tenant && (
        <section>
          <p>You don&apos;t have a WordPress site connected yet. Add one below — you&apos;ll become its admin.</p>
          <ConnectionForm siteUrl="" username="" />
        </section>
      )}

      {tenant && tenant.role === "admin" && (
        <>
          <section>
            <h2>Connection</h2>
            <ConnectionForm siteUrl={tenant.siteUrl} username={tenant.username} />
          </section>
          <section>
            <h2>Members</h2>
            <MembersPanel members={await getPopulatedMembers(tenant.connectionId)} />
          </section>
        </>
      )}

      {tenant && tenant.role === "member" && (
        <section>
          <h2>Connection</h2>
          <p>
            Connected to <strong>{tenant.siteUrl}</strong>. Only the tenant admin can change the site or
            Application Password.
          </p>
        </section>
      )}

      <section>
        <h2>Your API key</h2>
        <ApiKeyPanel />
      </section>
    </main>
  );
}
