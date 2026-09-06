export interface ModuleDefinition {
  slug: string;
  name: string;
  description: string;
  connectPath: string;
  mcpPath: string;
}

export const MODULES: ModuleDefinition[] = [
  {
    slug: "wordpress",
    name: "WordPress",
    description: "Write, categorize, tag, illustrate, and publish blog posts to a connected WordPress site.",
    connectPath: "/wordpress/connect",
    mcpPath: "/api/wordpress/mcp",
  },
];
