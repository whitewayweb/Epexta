// Light/dark mode is Tailwind's `dark` class on <html> (see the `dark` variant in
// app/globals.css). The choice is a per-browser preference, so it lives in localStorage.
// Kept apart from components/theme.ts so the server-rendered root layout can import it.

export const THEME_STORAGE_KEY = "theme";
export const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Inlined in the root layout's <head> so the class is set before first paint - otherwise a
 * dark-mode user sees a flash of the light theme on every full page load.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="dark"||(t==="system"&&matchMedia("${DARK_QUERY}").matches))document.documentElement.classList.add("dark")}catch(e){}`;
