import type { ToolAnnotations } from "@modelcontextprotocol/server";
import { getAppUrl } from "@/lib/app-url";
import { MODULES, type ModuleSlug } from "@/lib/modules";

const PRODUCT_NAME = "Epexta";
const SERVER_VERSION = "1.0.0";

/**
 * The serverInfo and instructions every Epexta MCP route reports, derived from the
 * modules registered at that route's mcpPath. Without this, mcp-handler reports its
 * default "mcp-typescript server on vercel", and clients that key connectors by an
 * opaque id (Claude names connector tools `mcp__<uuid>__<tool>`) give the model
 * nothing that ties the tools to the name customers know the product by.
 *
 * serverInfo is display-only per the MCP spec (clients must not rely on it for
 * disambiguation), so the same identity also leads the instructions text, which
 * clients do surface to the model.
 */
export function mcpServerIdentity(mcpPath: string, instructions: readonly string[] = []) {
  const modules = MODULES.filter((m) => m.mcpPath === mcpPath);
  if (modules.length === 0) throw new Error(`No module is registered at mcpPath ${mcpPath}.`);

  const moduleNames = modules.map((m) => m.name).join(" and ");
  const title = `${PRODUCT_NAME} ${moduleNames}`;

  return {
    serverInfo: {
      name: `epexta-${modules.map((m) => m.slug).join("-")}`,
      title,
      version: SERVER_VERSION,
      description: modules.map((m) => m.description).join(" "),
      websiteUrl: getAppUrl(),
    },
    instructions: [`These are ${PRODUCT_NAME}'s ${moduleNames} tools.`, ...instructions].join(" "),
  };
}

/**
 * Behaviour hints every Epexta MCP tool must declare. An unannotated tool is read by
 * clients as the worst case per the MCP spec (not read-only, destructive, open-world),
 * so ChatGPT labels a pure lookup "Public write / Destructive" and may confirm each call.
 * `withToolIdentity` (below) requires one of these on every tool config, so none can skip it.
 *
 * Every Epexta tool talks to a third-party system (a customer's WordPress site, Google),
 * hence `openWorldHint: true` throughout. No tool deletes anything (see CLAUDE.md), so
 * writes are never destructive.
 */
export const READ_ONLY_TOOL = {
  readOnlyHint: true,
  openWorldHint: true,
} as const satisfies ToolAnnotations;

/** Creates something new each call, so retrying is not a no-op. */
export const CREATE_TOOL = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const satisfies ToolAnnotations;

/** Sets fields to given values, so repeating the call with the same arguments changes nothing more. */
export const UPDATE_TOOL = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const satisfies ToolAnnotations;

/**
 * Prefixes a tool's description with the Epexta module it belongs to. Clients that
 * search deferred tools (Claude's tool search) match on tool names and descriptions,
 * not serverInfo or instructions, so this is what lets "Epexta" find every tool.
 * Applied by each route's registerGatedTool, so no tool can be registered without it -
 * and the config type demands `annotations` (READ_ONLY_TOOL etc. above) for the same reason.
 */
export function withToolIdentity<C extends { description?: string; annotations: ToolAnnotations }>(moduleSlug: ModuleSlug, config: C): C {
  const moduleName = MODULES.find((m) => m.slug === moduleSlug)?.name;
  if (!moduleName) throw new Error(`No module is registered with slug ${moduleSlug}.`);

  const prefix = `${PRODUCT_NAME} ${moduleName}:`;
  return config.description ? { ...config, description: `${prefix} ${config.description}` } : config;
}
