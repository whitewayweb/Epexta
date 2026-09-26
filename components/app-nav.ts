import { ChartColumn, KeyRound, type LucideIcon, Plug, Search, Users } from "lucide-react";
import type { ComponentType } from "react";
import { WordPressIcon } from "@/components/site/wordpress-icon";
import { MODULES, type ModuleSlug } from "@/lib/modules";

// One description of the signed-in app's pages, read by the sidebar, the breadcrumb and
// the command menu so the three never disagree about what exists or what it's called.

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon | ComponentType<{ className?: string }>;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// group is a free-text navigation key on the registry (lib/modules.ts) - it carries no
// authorization meaning, only how enabled modules are presented. This is the only place
// a group key is translated into a human label.
const GROUP_LABELS: Record<string, string> = {
  "google-site-hub": "Google Site Hub",
};

const MODULE_ICONS: Record<ModuleSlug, NavItem["icon"]> = {
  wordpress: WordPressIcon,
  "google-search-console": Search,
  "google-analytics": ChartColumn,
};

const SETTINGS: NavGroup = {
  label: "Settings",
  items: [
    { href: "/settings/members", label: "Members", icon: Users },
    { href: "/settings/connected-apps", label: "Connected apps", icon: Plug },
    { href: "/settings/api-key", label: "API keys", icon: KeyRound },
  ],
};

// Pages below a nav item that the breadcrumb names by their last path segment.
const SUBPAGE_LABELS: Record<string, string> = {
  connect: "Connect",
  performance: "Post performance",
};

/** Enabled modules (ungrouped first, then one group per registry group), then settings. */
export function buildAppNav(enabledModuleSlugs: readonly ModuleSlug[]): NavGroup[] {
  const groups: NavGroup[] = [];
  const toItem = (module: (typeof MODULES)[number]): NavItem => ({
    href: module.overviewPath,
    label: module.name,
    icon: MODULE_ICONS[module.slug],
  });
  const groupOf = (module: (typeof MODULES)[number]): string | undefined => ("group" in module ? module.group : undefined);
  const visible = MODULES.filter((module) => enabledModuleSlugs.includes(module.slug));

  const ungrouped = visible.filter((module) => !groupOf(module));
  if (ungrouped.length > 0) groups.push({ label: "Modules", items: ungrouped.map(toItem) });

  for (const key of new Set(visible.map(groupOf).filter((g): g is string => Boolean(g)))) {
    groups.push({
      label: GROUP_LABELS[key] ?? key,
      items: visible.filter((module) => groupOf(module) === key).map(toItem),
    });
  }

  groups.push(SETTINGS);
  return groups;
}

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** "Google Site Hub / Google Search Console / Post performance" for the current page. */
export function breadcrumbFor(nav: NavGroup[], pathname: string): { label: string; href?: string }[] {
  for (const group of nav) {
    const item = group.items.find((candidate) => isNavItemActive(candidate, pathname));
    if (!item) continue;
    const crumbs: { label: string; href?: string }[] = [{ label: group.label }];
    if (pathname === item.href) return [...crumbs, { label: item.label }];
    const subpage = SUBPAGE_LABELS[pathname.slice(item.href.length + 1).split("/")[0]];
    return [...crumbs, { label: item.label, href: item.href }, ...(subpage ? [{ label: subpage }] : [])];
  }
  return [];
}
