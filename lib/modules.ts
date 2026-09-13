export interface ModuleDefinition {
  slug: string;
  name: string;
  description: string;
  /** Read-only overview of what's connected, linked from the app sidebar. */
  overviewPath: string;
  connectPath: string;
  mcpPath: string;
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
] as const satisfies readonly ModuleDefinition[];

export type ModuleSlug = (typeof MODULES)[number]["slug"];
export const MODULE_SLUGS: readonly ModuleSlug[] = MODULES.map((m) => m.slug);
