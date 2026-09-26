"use client";

import { KeyRound, Moon, Plug, Plus, Search, Sun, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { NavGroup } from "@/components/app-nav";
import { isDarkNow, setTheme } from "@/components/theme";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Kbd, KbdGroup } from "@/components/ui/kbd";

/** ⌘K / Ctrl+K: jump to any page in the nav, or start a common task. */
export function CommandMenu({ nav, isAdmin, wordpressEnabled }: { nav: NavGroup[]; isAdmin: boolean; wordpressEnabled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  // Only tasks the user's role can actually do - the pages themselves still enforce it.
  const actions = [
    { label: "Connect an app", icon: Plug, href: "/settings/connected-apps" },
    ...(wordpressEnabled && isAdmin ? [{ label: "Add WordPress site", icon: Plus, href: "/wordpress/connect" }] : []),
    ...(isAdmin ? [{ label: "Invite a member", icon: UserPlus, href: "/settings/members" }] : []),
    { label: "Create API key", icon: KeyRound, href: "/settings/api-key" },
  ];

  return (
    <>
      <Button
        variant="outline"
        className="h-8 gap-2 px-2.5 text-muted-foreground sm:w-60 sm:justify-start"
        onClick={() => setOpen(true)}
        aria-label="Search pages and actions"
      >
        <Search />
        <span className="hidden flex-1 text-left font-normal sm:inline">Search or jump to…</span>
        <KbdGroup className="hidden sm:inline-flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Jump to a page or start a task">
        <Command>
          <CommandInput placeholder="Search pages and actions…" />
          <CommandList>
            <CommandEmpty>Nothing matches that.</CommandEmpty>
            {nav.map((group) => (
              <CommandGroup key={group.label} heading={group.label}>
                {group.items.map((item) => (
                  <CommandItem key={item.href} value={`${group.label} ${item.label}`} onSelect={() => run(() => router.push(item.href))}>
                    <item.icon />
                    {item.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
            <CommandSeparator />
            <CommandGroup heading="Actions">
              {actions.map((action) => (
                <CommandItem key={action.label} onSelect={() => run(() => router.push(action.href))}>
                  <action.icon />
                  {action.label}
                </CommandItem>
              ))}
              <CommandItem onSelect={() => run(() => setTheme(isDarkNow() ? "light" : "dark"))}>
                <Moon className="dark:hidden" />
                <Sun className="hidden dark:block" />
                Toggle dark mode
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
