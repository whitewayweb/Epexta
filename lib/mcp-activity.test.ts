import type { ServerContext } from "@modelcontextprotocol/server";
import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { listActivity } from "./activity";
import { ModuleNotEnabledError } from "./entitlements";
import { runLoggedTool } from "./mcp-activity";
import { READ_ONLY_TOOL, UPDATE_TOOL } from "./mcp-server-identity";
import { getPayloadClient } from "./payload";

describe("runLoggedTool", () => {
  const suffix = randomUUID();
  let userId: string;
  let organisationId: string;

  const ctxFor = (caller: unknown) => ({ http: { authInfo: { extra: { caller } } } }) as unknown as ServerContext;
  const errorResult = (e: unknown) => ({ content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true });
  const ok = { content: [{ type: "text", text: "{}" }] };
  const viewer = () => ({ userId, role: "admin" as const });

  beforeAll(async () => {
    const payload = await getPayloadClient();
    const user = await payload.create({
      collection: "users",
      data: { email: `mcp-activity-${suffix}@example.com`, password: "test-password-123", role: "customer", name: "Tool Caller" },
    });
    userId = String(user.id);
    const org = await payload.create({
      collection: "organisations",
      data: { name: `mcp-activity-${suffix}`, members: [{ user: Number(userId), role: "admin" }] },
      overrideAccess: true,
    });
    organisationId = String(org.id);
  });

  afterAll(async () => {
    const payload = await getPayloadClient();
    await payload.delete({ collection: "organisations", id: organisationId, overrideAccess: true }).catch(() => {});
    await payload.delete({ collection: "users", id: userId, overrideAccess: true }).catch(() => {});
  });

  const caller = () => ({ userId, organisationId, via: "api-key" as const });
  const run = (
    tool: { name: string; config: { title: string; annotations: typeof UPDATE_TOOL | typeof READ_ONLY_TOOL } },
    ctx: ServerContext,
    hooks: Partial<Parameters<typeof runLoggedTool>[2]>,
    handler: () => unknown
  ) =>
    runLoggedTool(
      { moduleSlug: "wordpress", ...tool },
      [{ title: "Hello" }, ctx],
      { assertEnabled: () => {}, errorResult, ...hooks },
      handler
    );

  it("returns the tool's own result and records a successful write with its description", async () => {
    const result = await run(
      { name: "update_post", config: { title: "Update Blog Post", annotations: UPDATE_TOOL } },
      ctxFor(caller()),
      { describe: (args) => ({ target: `"${String(args.title)}"`, siteLabel: "a.example.com" }) },
      () => ok
    );
    expect(result).toBe(ok);

    await vi.waitFor(async () => {
      const [item] = await listActivity(organisationId, viewer(), { limit: 1 });
      expect(item).toMatchObject({
        tool: "update_post",
        kind: "update",
        outcome: "success",
        summary: 'Update Blog Post: "Hello"',
        siteLabel: "a.example.com",
        actorLabel: "Tool Caller",
      });
    });
  });

  it("records a failed tool result with its message", async () => {
    await run(
      { name: "list_posts", config: { title: "List WordPress Posts", annotations: READ_ONLY_TOOL } },
      ctxFor(caller()),
      {},
      () => errorResult(new Error("Site rejected the credentials"))
    );

    await vi.waitFor(async () => {
      const [item] = await listActivity(organisationId, viewer(), { limit: 1, outcome: "failure" });
      expect(item).toMatchObject({ tool: "list_posts", kind: "read", summary: "List WordPress Posts failed: Site rejected the credentials" });
    });
  });

  it("returns the entitlement error without running the tool, and logs it as not_enabled", async () => {
    const handler = vi.fn(() => ok);
    const result = await run(
      { name: "create_post", config: { title: "Create Blog Post", annotations: UPDATE_TOOL } },
      ctxFor(caller()),
      {
        assertEnabled: () => {
          throw new ModuleNotEnabledError("wordpress");
        },
      },
      handler
    );

    expect(handler).not.toHaveBeenCalled();
    expect((result as { isError: boolean }).isError).toBe(true);
    await vi.waitFor(async () => {
      const events = await listActivity(organisationId, viewer(), { limit: 10, outcome: "failure" });
      expect(events.some((e) => e.tool === "create_post")).toBe(true);
    });
  });

  it("skips elicitation results and callers without an organisation", async () => {
    const before = await listActivity(organisationId, viewer(), { limit: 50 });
    const config = { title: "Create Blog Post", annotations: UPDATE_TOOL };

    const elicit = { resultType: "input_required", inputRequests: {} };
    expect(await run({ name: "create_post", config }, ctxFor(caller()), {}, () => elicit)).toBe(elicit);
    await run({ name: "create_post", config }, ctxFor({ ...caller(), organisationId: null }), {}, () => ok);

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await listActivity(organisationId, viewer(), { limit: 50 })).toHaveLength(before.length);
  });
});
