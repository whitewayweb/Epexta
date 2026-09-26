"use client";

import { Moon, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { breadcrumbFor, buildAppNav } from "@/components/app-nav";
import { CommandMenu } from "@/components/command-menu";
import { isDarkNow, setTheme } from "@/components/theme";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { ModuleSlug } from "@/lib/modules";

// Icons are components, which can't be passed from the server layout - so the nav is built here.
export function AppHeader({ enabledModuleSlugs, isAdmin }: { enabledModuleSlugs: readonly ModuleSlug[]; isAdmin: boolean }) {
  const nav = buildAppNav(enabledModuleSlugs);
  const crumbs = breadcrumbFor(nav, usePathname());

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="my-4" />
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList className="flex-nowrap">
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;
            return (
              <Fragment key={crumb.label}>
                <BreadcrumbItem className={last ? "min-w-0" : "hidden md:inline-flex"}>
                  {last ? (
                    <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
                  ) : crumb.href ? (
                    <BreadcrumbLink render={<Link href={crumb.href} />}>{crumb.label}</BreadcrumbLink>
                  ) : (
                    crumb.label
                  )}
                </BreadcrumbItem>
                {!last && <BreadcrumbSeparator className="hidden md:block" />}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
      <CommandMenu nav={nav} isAdmin={isAdmin} wordpressEnabled={enabledModuleSlugs.includes("wordpress")} />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Toggle dark mode"
        onClick={() => setTheme(isDarkNow() ? "light" : "dark")}
      >
        <Moon className="dark:hidden" />
        <Sun className="hidden dark:block" />
      </Button>
    </header>
  );
}
