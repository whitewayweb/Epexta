"use client";

import { ChevronsUpDown, KeyRound, LogOut, Monitor, Moon, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { buildAppNav, isNavItemActive } from "@/components/app-nav";
import { LogoMark } from "@/components/site/logo-mark";
import { setTheme, type Theme, useTheme } from "@/components/theme";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { logoutAction } from "@/lib/auth-actions";
import type { OrganisationRole } from "@/lib/members";
import type { ModuleSlug } from "@/lib/modules";

export interface SidebarOrganisation {
  name: string;
  role: OrganisationRole;
}

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function initials(text: string): string {
  const words = text.split(/[\s@._-]+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "?";
}

function AccountMenu({ email }: { email: string }) {
  const theme = useTheme();
  const logoutForm = useRef<HTMLFormElement>(null);

  return (
    <>
      <form ref={logoutForm} action={logoutAction} hidden />
      <DropdownMenu>
        <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(email)}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1 truncate text-sm">{email}</span>
          <ChevronsUpDown className="ml-auto text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" className="min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Theme</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
              {THEMES.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  <option.icon />
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/settings/api-key" />}>
            <KeyRound />
            API keys
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => logoutForm.current?.requestSubmit()}>
            <LogOut />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

export function AppSidebar({
  email,
  organisation,
  enabledModuleSlugs,
}: {
  email: string;
  organisation: SidebarOrganisation | null;
  enabledModuleSlugs: readonly ModuleSlug[];
}) {
  const pathname = usePathname();
  const nav = buildAppNav(enabledModuleSlugs);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-3">
        <Link
          href="/"
          className="flex h-8 items-center gap-2.5 px-2 text-[15px] font-semibold tracking-tight group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          <LogoMark className="w-[18px] shrink-0" />
          <span className="group-data-[collapsible=icon]:hidden">epexta</span>
        </Link>
        {organisation && (
          // Shows which organisation the user is working in. Not a switcher: a user belongs to
          // one organisation today (see getUserOrganisation in lib/organisation.ts).
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                tooltip={organisation.name}
                className="border border-sidebar-border bg-background shadow-xs hover:bg-background group-data-[collapsible=icon]:border-0"
                render={<Link href="/settings/members" />}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
                  {initials(organisation.name)}
                </span>
                <span className="grid min-w-0 flex-1 leading-tight">
                  <span className="truncate font-semibold">{organisation.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {organisation.role === "admin" ? "Admin" : "Member"}
                  </span>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarHeader>

      <SidebarContent>
        {nav.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[11px] tracking-wider uppercase">{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isNavItemActive(item, pathname)}
                      tooltip={item.label}
                      className="data-active:bg-background data-active:shadow-xs data-active:ring-1 data-active:ring-sidebar-border [&[data-active]>svg]:text-primary"
                      render={<Link href={item.href} />}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <AccountMenu email={email} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
