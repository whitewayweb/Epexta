import { describe, expect, it } from "vitest";
import { MODULES } from "@/lib/modules";
import { mcpServerIdentity, withToolIdentity } from "@/lib/mcp-server-identity";

describe("mcpServerIdentity", () => {
  it("names a single-module route after Epexta and that module", () => {
    const { serverInfo, instructions } = mcpServerIdentity("/api/wordpress/mcp", ["Call list_sites first."]);

    expect(serverInfo.name).toBe("epexta-wordpress");
    expect(serverInfo.title).toBe("Epexta WordPress");
    expect(instructions).toBe("These are Epexta's WordPress tools. Call list_sites first.");
  });

  it("names a shared route after every module registered at it", () => {
    const { serverInfo, instructions } = mcpServerIdentity("/api/google/mcp");

    expect(serverInfo.title).toBe("Epexta Google Search Console and Google Analytics");
    expect(instructions).toContain("Epexta");
  });

  it("gives every registered MCP route a distinct server name", () => {
    const paths = [...new Set(MODULES.map((m) => m.mcpPath))];
    const names = paths.map((p) => mcpServerIdentity(p).serverInfo.name);

    expect(new Set(names).size).toBe(paths.length);
  });

  it("rejects a path with no registered module", () => {
    expect(() => mcpServerIdentity("/api/unknown/mcp")).toThrow();
  });
});

describe("withToolIdentity", () => {
  it("prefixes the description with Epexta and the tool's own module", () => {
    const config = withToolIdentity("google-analytics", { title: "List Sites", description: "List mapped sites." });

    expect(config).toEqual({ title: "List Sites", description: "Epexta Google Analytics: List mapped sites." });
  });

  it("leaves a config without a description unchanged", () => {
    const config: { title: string; description?: string } = { title: "List Sites" };

    expect(withToolIdentity("wordpress", config)).toEqual({ title: "List Sites" });
  });
});
