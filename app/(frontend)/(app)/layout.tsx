import { cookies } from "next/headers";
import type React from "react";
import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getEnabledModules } from "@/lib/entitlements";
import { getOrganisationName, getUserOrganisation } from "@/lib/organisation";
import { getCurrentUser } from "@/lib/session";

/**
 * Shared chrome for every page after login. Auth itself is enforced per-page (via
 * `requireUser`), not here, so that each page can redirect back to its own path.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const organisation = user ? await getUserOrganisation(user.id) : null;
  const [enabledModuleSlugs, organisationName, cookieStore] = await Promise.all([
    organisation ? getEnabledModules(organisation.organisationId) : Promise.resolve([]),
    organisation ? getOrganisationName(organisation.organisationId) : Promise.resolve(null),
    cookies(),
  ]);
  const isAdmin = organisation?.role === "admin";

  return (
    // The sidebar's own cookie, so a collapsed sidebar stays collapsed across page loads.
    <SidebarProvider defaultOpen={cookieStore.get("sidebar_state")?.value !== "false"}>
      <AppSidebar
        email={user?.email ?? ""}
        organisation={organisation && organisationName ? { name: organisationName, role: organisation.role } : null}
        enabledModuleSlugs={enabledModuleSlugs}
      />
      <SidebarInset className="min-w-0">
        <AppHeader enabledModuleSlugs={enabledModuleSlugs} isAdmin={isAdmin} />
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
