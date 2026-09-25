/**
 * A short, human date ("Sep 25, 2026"). A fixed locale (not the browser's) keeps server and
 * client render output identical, avoiding a hydration mismatch.
 */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
