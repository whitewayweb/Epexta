"use client";

import { useSyncExternalStore } from "react";
import { DARK_QUERY, THEME_STORAGE_KEY as STORAGE_KEY } from "@/components/theme-script";

// Reading and changing the light/dark preference - see components/theme-script.ts.

export type Theme = "light" | "dark" | "system";

const listeners = new Set<() => void>();

function readTheme(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "dark" || value === "system" ? value : "light";
  } catch {
    return "light";
  }
}

function applyTheme(theme: Theme): void {
  const dark = theme === "dark" || (theme === "system" && matchMedia(DARK_QUERY).matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage blocked: the change still applies to this page view.
  }
  applyTheme(theme);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Follow the OS setting live while the preference is "system".
  const media = matchMedia(DARK_QUERY);
  const onSystemChange = () => applyTheme(readTheme());
  media.addEventListener("change", onSystemChange);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", onSystemChange);
  };
}

/** The stored preference; "light" during the server render. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, readTheme, () => "light");
}

/** Whether the page is currently dark, whatever the preference. */
export function isDarkNow(): boolean {
  return document.documentElement.classList.contains("dark");
}
