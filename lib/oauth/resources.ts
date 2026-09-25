import { getAppUrl } from "@/lib/app-url";
import { MODULES, type ModuleSlug } from "@/lib/modules";

/** Every distinct MCP route path in the module registry, e.g. "/api/wordpress/mcp". */
export type McpPath = (typeof MODULES)[number]["mcpPath"];

/**
 * One OAuth protected resource (RFC 9728) per distinct MCP route. Derived from the
 * module registry, so a new module's route becomes an OAuth resource just by being
 * registered in lib/modules.ts - nothing under lib/oauth/ changes. Several modules may
 * share one route (Google Site Hub, see GOOGLE_PERFORMANCE_PLAN.md); they're still one
 * resource, since a token is bound to the route it's presented to.
 */
export interface McpResource {
  mcpPath: McpPath;
  /** Canonical resource URL: APP_URL + mcpPath. Tokens are audience-bound to exactly this. */
  url: string;
  /** Human-readable connector name, e.g. "Google Search Console + Google Analytics". */
  name: string;
  /** Path of this resource's RFC 9728 metadata document - what its 401 `WWW-Authenticate` points at. */
  metadataPath: string;
  modules: readonly { slug: ModuleSlug; name: string; connectPath: string }[];
}

export function listMcpResources(): McpResource[] {
  const appUrl = getAppUrl();
  const byPath = new Map<McpPath, McpResource>();
  for (const definition of MODULES) {
    const existing = byPath.get(definition.mcpPath);
    const entry = { slug: definition.slug, name: definition.name, connectPath: definition.connectPath };
    if (existing) {
      existing.modules = [...existing.modules, entry];
      existing.name = existing.modules.map((m) => m.name).join(" + ");
    } else {
      byPath.set(definition.mcpPath, {
        mcpPath: definition.mcpPath,
        url: `${appUrl}${definition.mcpPath}`,
        name: definition.name,
        // One document per route, never a root one - see protectedResourceMetadata in endpoints.ts.
        metadataPath: `/.well-known/oauth-protected-resource${definition.mcpPath}`,
        modules: [entry],
      });
    }
  }
  return [...byPath.values()];
}

export function getMcpResource(mcpPath: McpPath): McpResource {
  const resource = listMcpResources().find((r) => r.mcpPath === mcpPath);
  if (!resource) throw new Error(`${mcpPath} is not a registered MCP route.`);
  return resource;
}

export function findMcpResourceByPath(path: string): McpResource | undefined {
  return listMcpResources().find((r) => r.mcpPath === path);
}

/**
 * Resolves an RFC 8707 `resource` parameter to a known MCP resource. The MCP spec defines
 * the canonical form with a lowercase scheme/host and no trailing slash but says servers
 * SHOULD accept uppercase scheme/host, so compare after URL parsing (which lowercases
 * both) and a trailing-slash strip. A query or fragment never matches.
 */
export function findMcpResourceByUrl(raw: string): McpResource | undefined {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.search || url.hash) return undefined;
  const canonical = `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  return listMcpResources().find((r) => r.url === canonical);
}
