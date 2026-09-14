export interface ModuleDefinition {
  slug: string;
  name: string;
  description: string;
  /** Read-only overview of what's connected, linked from the app sidebar. */
  overviewPath: string;
  connectPath: string;
  mcpPath: string;
  /**
   * Free-text UI/navigation grouping key, e.g. "google-site-hub" - see "Google Site
   * Hub as a registry grouping" in GOOGLE_PERFORMANCE_PLAN.md. Carries no authorization
   * meaning: entitlement, connection, and mapping data stay keyed by slug, never group.
   */
  group?: string;
}

export const MODULES = [
  {
    slug: "wordpress",
    name: "WordPress",
    description: "Write, categorize, tag, illustrate, and publish blog posts to a connected WordPress site.",
    overviewPath: "/wordpress",
    connectPath: "/wordpress/connect",
    mcpPath: "/api/wordpress/mcp",
  },
  {
    slug: "google-search-console",
    name: "Google Search Console",
    description: "Search performance reporting - clicks, impressions, queries, and index status for your posts.",
    overviewPath: "/google-search-console",
    connectPath: "/google-search-console/connect",
    // Points at the combined Google Site Hub route - see "One Google Site Hub MCP
    // endpoint, not one per module" in GOOGLE_PERFORMANCE_PLAN.md. The old
    // /api/google-search-console/mcp route stays live as a compatibility endpoint
    // for already-registered connectors; new onboarding only ever hands out this URL.
    mcpPath: "/api/google/mcp",
    group: "google-site-hub",
  },
  {
    slug: "google-analytics",
    name: "Google Analytics",
    description: "GA4 engagement reporting - users, sessions, and key events for your posts.",
    overviewPath: "/google-analytics",
    connectPath: "/google-analytics/connect",
    // Same combined route as google-search-console above - see that comment.
    mcpPath: "/api/google/mcp",
    group: "google-site-hub",
  },
] as const satisfies readonly ModuleDefinition[];

export type ModuleSlug = (typeof MODULES)[number]["slug"];
export const MODULE_SLUGS: readonly ModuleSlug[] = MODULES.map((m) => m.slug);
