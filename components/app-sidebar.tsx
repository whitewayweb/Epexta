"use client";

import { KeyRound, LayoutDashboard, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "@/components/site/logo-mark";
import { WordPressIcon } from "@/components/site/wordpress-icon";
import { Button } from "@/components/ui/button";
import type { ModuleDefinition } from "@/lib/modules";
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
} from "@/components/ui/sidebar";
import { logoutAction } from "@/lib/auth-actions";
import { MODULES } from "@/lib/modules";

function ModuleIcon({ slug, className }: { slug: ModuleDefinition["slug"]; className?: string }) {
  if (slug === "wordpress") return <WordPressIcon className={className} />;
  return <LayoutDashboard className={className} />;
}

const SETTINGS_LINKS = [
  { href: "/settings/members", label: "Members", icon: Users },
  { href: "/settings/api-key", label: "API key", icon: KeyRound },
];

export function AppSidebar({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader>
        <Link href="/" className="flex items-center gap-2.5 px-2 py-1.5 text-sm font-semibold tracking-tight">
          <LogoMark />
          epexta
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Modules</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {MODULES.map((module) => (
                <SidebarMenuItem key={module.slug}>
                  <SidebarMenuButton
                    isActive={pathname === module.overviewPath || pathname.startsWith(`${module.connectPath}`)}
                    render={<Link href={module.overviewPath} />}
                  >
                    <ModuleIcon slug={module.slug} />
                    <span>{module.name}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {SETTINGS_LINKS.map((link) => (
                <SidebarMenuItem key={link.href}>
                  <SidebarMenuButton isActive={pathname === link.href} render={<Link href={link.href} />}>
                    <link.icon />
                    <span>{link.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <p className="truncate px-2 text-xs text-muted-foreground">{email}</p>
        <form action={logoutAction}>
          <Button type="submit" variant="outline" size="sm" className="w-full">
            Log out
          </Button>
        </form>
      </SidebarFooter>
    </Sidebar>
  );
}
