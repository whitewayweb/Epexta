import type { AuthInfo, InputRequiredResult, ServerContext } from "@modelcontextprotocol/server";
import { acceptedContent, inputRequired, inputResponse } from "@modelcontextprotocol/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { assertModuleEnabled, isModuleEnabled, ModuleNotEnabledError } from "@/lib/entitlements";
import { getUserOrganisation } from "@/lib/organisation";
import { getUserByApiKey } from "@/lib/session";
import { listWordPressConnections } from "@/modules/wordpress/organisation";
import { listMappingsForOrganisation } from "@/modules/google-analytics/mappings";
import { comparePostPerformance, getPostPerformance } from "@/modules/google-analytics/reporting";

class ToolError extends Error {}

function textResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(error: unknown) {
  if (error instanceof ToolError || error instanceof ModuleNotEnabledError) {
    return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
  }
  console.error("[google-analytics-mcp] tool call threw an unexpected error:", error);
  return {
    content: [{ type: "text" as const, text: "Error: Something went wrong while processing this request." }],
    isError: true,
  };
}

interface MappedSite {
  wordpressConnectionId: string;
  label: string;
}

async function verifyToken(_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  try {
    const user = await getUserByApiKey(bearerToken);
    if (!user) return undefined;

    const organisation = await getUserOrganisation(user.id);
    const moduleEnabled = organisation ? await isModuleEnabled(organisation.organisationId, "google-analytics") : false;

    let mappedSites: MappedSite[] = [];
    if (moduleEnabled && organisation) {
      const [mappings, connections] = await Promise.all([
        listMappingsForOrganisation(organisation.organisationId),
        listWordPressConnections(organisation.organisationId),
      ]);
      mappedSites = mappings.map((mapping) => {
        const connection = connections.find((c) => c.connectionId === mapping.wordpressConnectionId);
        return {
          wordpressConnectionId: mapping.wordpressConnectionId,
          label: connection ? (connection.label ? `${connection.label} (${connection.siteUrl})` : connection.siteUrl) : mapping.wordpressConnectionId,
        };
      });
    }

    return {
      token: bearerToken,
      clientId: user.id,
      scopes: [],
      extra: { organisationId: organisation?.organisationId ?? null, mappedSites, moduleEnabled },
    };
  } catch (error) {
    console.error("[google-analytics-mcp] auth threw an error:", error);
    return undefined;
  }
}

const siteSelectionSchema = z.object({ siteId: z.string() });

type ResolvedSite = { ok: true; wordpressConnectionId: string } | { ok: false; elicit: InputRequiredResult };

// Mirrors resolveConnection in app/api/wordpress/mcp/route.ts - see CLAUDE.md's MCP
// elicitation notes. Only sites with an active GA4 mapping are offered, since an
// unmapped site has nothing this module can report on.
function resolveSite(ctx: ServerContext, siteId?: number): ResolvedSite {
  const sites = (ctx.http?.authInfo?.extra?.mappedSites as MappedSite[] | undefined) ?? [];

  if (sites.length === 0) {
    throw new ToolError(
      "No WordPress site has an active GA4 mapping yet. Visit /google-analytics/connect to map one, then try again."
    );
  }

  if (siteId !== undefined) {
    const match = sites.find((s) => Number(s.wordpressConnectionId) === siteId);
    if (!match) throw new ToolError(`No mapped site with siteId ${siteId}. Call list_mapped_sites to see valid site IDs.`);
    return { ok: true, wordpressConnectionId: match.wordpressConnectionId };
  }

  if (sites.length === 1) return { ok: true, wordpressConnectionId: sites[0].wordpressConnectionId };

  const response = inputResponse(ctx.mcpReq.inputResponses, "siteId");

  if (response.kind === "elicit" && response.action === "decline") {
    throw new ToolError("No site was selected. The operation was cancelled.");
  }
  if (response.kind === "elicit" && response.action === "cancel") {
    throw new ToolError("Site selection was dismissed. The operation was cancelled.");
  }

  if (response.kind === "missing") {
    return {
      ok: false,
      elicit: inputRequired({
        inputRequests: {
          siteId: inputRequired.elicit({
            message: "Which mapped WordPress site should this report use?",
            requestedSchema: {
              type: "object",
              properties: {
                siteId: {
                  type: "string",
                  title: "Website",
                  enum: sites.map((s) => s.wordpressConnectionId),
                  enumNames: sites.map((s) => s.label),
                },
              },
              required: ["siteId"],
            },
          }),
        },
      }),
    };
  }

  const accepted = acceptedContent(ctx.mcpReq.inputResponses, "siteId", siteSelectionSchema);
  if (accepted === undefined) throw new ToolError("The site selection was incomplete. The operation was cancelled.");

  const selected = sites.find((s) => s.wordpressConnectionId === accepted.siteId);
  if (!selected) throw new ToolError("The selected site is no longer mapped. The operation was cancelled.");
  return { ok: true, wordpressConnectionId: selected.wordpressConnectionId };
}

const siteIdSchema = z
  .number()
  .int()
  .optional()
  .describe(
    "Which mapped WordPress site to report on, from list_mapped_sites. Optional when only one site is mapped. " +
      "When several are mapped, either supply this or omit it to have the server ask the user to choose."
  );
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

function reportErrorMessage(status: "not_mapped" | "consent_expired" | "temporary_failure" | "unavailable"): string {
  switch (status) {
    case "not_mapped":
      return "This site has no active GA4 mapping. Visit /google-analytics/connect to map one.";
    case "consent_expired":
      return "The connected Google account needs to be reconnected. Visit /google-analytics/connect to reconnect.";
    case "temporary_failure":
      return "Google Analytics is temporarily unavailable (rate limit or network issue). Try again shortly.";
    case "unavailable":
      return "Analytics data is not available for this request right now.";
  }
}

const rawHandler = createMcpHandler(
  (server) => {
    const registerGatedTool: typeof server.registerTool = ((name: string, config: unknown, handler: (...a: unknown[]) => unknown) => {
      return server.registerTool(name, config as never, (async (...handlerArgs: unknown[]) => {
        try {
          const ctx = handlerArgs[handlerArgs.length - 1] as ServerContext;
          const moduleEnabled = Boolean((ctx.http?.authInfo?.extra as { moduleEnabled?: boolean } | undefined)?.moduleEnabled);
          assertModuleEnabled(moduleEnabled, "google-analytics");
        } catch (e) {
          return errorResult(e);
        }
        return handler(...handlerArgs);
      }) as never);
    }) as typeof server.registerTool;

    registerGatedTool(
      "list_mapped_sites",
      {
        title: "List Analytics-Mapped Sites",
        description:
          "List the WordPress sites with an active GA4 mapping for this organisation. Call this first when several sites are mapped.",
        inputSchema: z.object({}),
      },
      async (_args, ctx) => {
        try {
          const sites = (ctx.http?.authInfo?.extra?.mappedSites as MappedSite[] | undefined) ?? [];
          return textResult(sites.map((s) => ({ siteId: Number(s.wordpressConnectionId), label: s.label })));
        } catch (e) {
          return errorResult(e);
        }
      }
    );

    registerGatedTool(
      "get_analytics_performance",
      {
        title: "Get Analytics Performance",
        description:
          "Report GA4 metrics (active users, sessions, engaged sessions, key events) for one WordPress post over a date range. Defaults to the trailing 28 days.",
        inputSchema: z.object({
          siteId: siteIdSchema,
          postId: z.number().int().describe("The WordPress post ID to report on."),
          startDate: dateSchema.optional().describe("Defaults to 28 days before endDate."),
          endDate: dateSchema.optional().describe("Defaults to today."),
        }),
      },
      async ({ siteId, postId, startDate, endDate }, ctx) => {
        try {
          const resolved = resolveSite(ctx, siteId);
          if (!resolved.ok) return resolved.elicit;
          const organisationId = (ctx.http?.authInfo?.extra as { organisationId?: string } | undefined)?.organisationId;
          if (!organisationId) throw new ToolError("No organisation found for this account.");

          const range = startDate && endDate ? { startDate, endDate } : undefined;
          const result = await getPostPerformance(organisationId, resolved.wordpressConnectionId, postId, range);
          if (result.status !== "ok") throw new ToolError(reportErrorMessage(result.status));
          return textResult(result.data);
        } catch (e) {
          return errorResult(e);
        }
      }
    );

    registerGatedTool(
      "compare_analytics_periods",
      {
        title: "Compare Analytics Periods",
        description:
          "Compare GA4 metrics for one WordPress post between two equal-length periods, e.g. the latest 28 days versus the previous 28. Defaults to that comparison.",
        inputSchema: z.object({
          siteId: siteIdSchema,
          postId: z.number().int().describe("The WordPress post ID to report on."),
          startDate: dateSchema.optional().describe("Start of the current period. Defaults to 28 days before endDate."),
          endDate: dateSchema.optional().describe("End of the current period. Defaults to today."),
        }),
      },
      async ({ siteId, postId, startDate, endDate }, ctx) => {
        try {
          const resolved = resolveSite(ctx, siteId);
          if (!resolved.ok) return resolved.elicit;
          const organisationId = (ctx.http?.authInfo?.extra as { organisationId?: string } | undefined)?.organisationId;
          if (!organisationId) throw new ToolError("No organisation found for this account.");

          const range = startDate && endDate ? { startDate, endDate } : undefined;
          const result = await comparePostPerformance(organisationId, resolved.wordpressConnectionId, postId, range);
          if (result.status !== "ok") throw new ToolError(reportErrorMessage(result.status));
          return textResult(result.data);
        } catch (e) {
          return errorResult(e);
        }
      }
    );
  },
  {
    instructions:
      "siteId (from list_mapped_sites) selects which mapped WordPress site a tool reports on - it's shared between " +
      "get_analytics_performance and compare_analytics_periods, so a value obtained from list_mapped_sites can be " +
      "reused across calls in the same session.",
  }
);

const handler = withMcpAuth(rawHandler, verifyToken, { required: true });

export const maxDuration = 60;

export { handler as GET, handler as POST };
