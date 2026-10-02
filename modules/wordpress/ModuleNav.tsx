"use client";

import { Plug, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

const ITEMS = [
  { href: "/wordpress", label: "Connect", icon: Plug },
  { href: "/wordpress/settings", label: "Settings", icon: Settings },
];

/** Inner navigation for the WordPress module: /wordpress and /wordpress/connect are "Connect". */
export function ModuleNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="WordPress" className="flex gap-1 md:w-52 md:shrink-0 md:flex-col">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = href === "/wordpress/settings" ? pathname.startsWith(href) : !pathname.startsWith("/wordpress/settings");
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
