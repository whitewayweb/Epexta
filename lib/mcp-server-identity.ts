import { getAppUrl } from "@/lib/app-url";
import { MODULES } from "@/lib/modules";

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
