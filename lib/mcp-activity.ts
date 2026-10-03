import type { ServerContext, ToolAnnotations } from "@modelcontextprotocol/server";
import { recordActivity, type ActivityKind } from "./activity";
import { runAfterResponse } from "./after-response";
import { ModuleNotEnabledError } from "./entitlements";
import type { McpCaller } from "./mcp-auth";
import type { ModuleSlug } from "./modules";

/** What a module can tell the log about one call, from the tool's arguments. */
export interface ActivityDescription {
  /** The thing acted on, e.g. a post title. Appended to the tool's title in the feed. */
  target?: string | null;
  /** The connected site the call went to. */
  siteLabel?: string | null;
}

export type DescribeCall = (args: Record<string, unknown>, ctx: ServerContext) => ActivityDescription;

interface RegisteredTool {
  moduleSlug: ModuleSlug;
  name: string;
  config: { title?: string; annotations: ToolAnnotations };
}

function kindOf(annotations: ToolAnnotations): ActivityKind {
  if (annotations.readOnlyHint) return "read";
  return annotations.idempotentHint ? "update" : "create";
}

/** The authenticated caller `withEpextaMcpAuth` attaches to every request's auth info. */
function callerOf(ctx: ServerContext): McpCaller | undefined {
  return (ctx.http?.authInfo?.extra as { caller?: McpCaller } | undefined)?.caller;
}

function resultText(result: unknown): string {
  const content = (result as { content?: { type?: string; text?: string }[] }).content;
  return content?.find((part) => part.type === "text")?.text ?? "";
}

/**
 * The one place every MCP tool call passes through, from each route's `registerGatedTool`:
 * checks the module entitlement, runs the tool, and records the outcome in the activity log
 * (lib/activity.ts) after the response, so a logging problem never touches the tool's result.
 * Routing both through here is what makes "every tool is gated and logged" structural - no
 * tool can opt out of either. A call that only asks the user to choose (an elicitation) did
 * nothing yet, so it isn't recorded.
 */
export async function runLoggedTool(
  tool: RegisteredTool,
  handlerArgs: unknown[],
  hooks: {
    assertEnabled: (ctx: ServerContext) => void;
    errorResult: (error: unknown) => unknown;
    describe?: DescribeCall;
  },
  run: () => unknown
): Promise<unknown> {
  const ctx = handlerArgs[handlerArgs.length - 1] as ServerContext;
  const started = Date.now();

  let result: unknown;
  let errorCode: "not_enabled" | "tool_error" | null = null;
  try {
    hooks.assertEnabled(ctx);
  } catch (error) {
    result = hooks.errorResult(error);
    errorCode = error instanceof ModuleNotEnabledError ? "not_enabled" : null;
  }
  result ??= await run();

  const caller = callerOf(ctx);
  const isToolResult = Array.isArray((result as { content?: unknown })?.content);
  if (!caller?.organisationId || !isToolResult) return result;

  const failed = (result as { isError?: boolean }).isError === true;
  const organisationId = caller.organisationId;
  const title = tool.config.title ?? tool.name;
  const args = (handlerArgs.length > 1 ? handlerArgs[0] : {}) as Record<string, unknown>;
  const durationMs = Date.now() - started;

  runAfterResponse("activity-log", async () => {
    const description = hooks.describe?.(args, ctx) ?? {};
    const summary = failed
      ? `${title} failed: ${resultText(result).replace(/^Error:\s*/, "")}`
      : description.target
        ? `${title}: ${description.target}`
        : title;
    await recordActivity({
      organisationId,
      userId: caller.userId,
      module: tool.moduleSlug,
      tool: tool.name,
      kind: kindOf(tool.config.annotations),
      outcome: failed ? "failure" : "success",
      summary,
      siteLabel: description.siteLabel,
      source: caller.via,
      oauthClientId: caller.oauthClientId,
      errorCode: failed ? (errorCode ?? "tool_error") : null,
      durationMs,
    });
  });

  return result;
}
