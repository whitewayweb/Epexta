import type React from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { getEnabledModules } from "@/lib/entitlements";
import { getUserOrganisation } from "@/lib/organisation";
import { getCurrentUser } from "@/lib/session";

/**
 * Shared chrome for every page after login. Auth itself is enforced per-page (via
 * `requireUser`), not here, so that each page can redirect back to its own path.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const organisation = user ? await getUserOrganisation(user.id) : null;
  const enabledModuleSlugs = organisation ? await getEnabledModules(organisation.organisationId) : [];

  return (
    <SidebarProvider>
      <AppSidebar email={user?.email ?? ""} enabledModuleSlugs={enabledModuleSlugs} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center border-b border-border/60 px-4">
          <SidebarTrigger />
        </header>
        <div className="flex-1 p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
