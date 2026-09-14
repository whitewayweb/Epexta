import type { AuthInfo, InputRequiredResult, ServerContext } from "@modelcontextprotocol/server";
import { acceptedContent, inputRequired, inputResponse } from "@modelcontextprotocol/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { assertModuleEnabled, isModuleEnabled, ModuleNotEnabledError } from "@/lib/entitlements";
import { getUserOrganisation } from "@/lib/organisation";
import { getUserByApiKey } from "@/lib/session";
import { listWordPressConnections } from "@/modules/wordpress/organisation";
import { listMappingsForOrganisation as listAnalyticsMappingsForOrganisation } from "@/modules/google-analytics/mappings";
import {
  comparePostPerformance as compareAnalyticsPeriods,
  compareSitePerformance as compareSiteAnalyticsPeriods,
  getPostPerformance as getAnalyticsPerformance,
  getSitePerformance as getSiteAnalyticsPerformance,
} from "@/modules/google-analytics/reporting";
import { listMappingsForOrganisation as listSearchConsoleMappingsForOrganisation } from "@/modules/google-search-console/mappings";
import {
  comparePostPerformance as compareSearchConsolePeriods,
  compareSitePerformance as compareSiteSearchConsolePeriods,
  getPostPerformance as getSearchConsolePerformance,
  getSitePerformance as getSiteSearchConsolePerformance,
} from "@/modules/google-search-console/reporting";

class ToolError extends Error {}

function textResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(error: unknown, logPrefix: string) {
  if (error instanceof ToolError || error instanceof ModuleNotEnabledError) {
    return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
  }
  console.error(`[${logPrefix}] tool call threw an unexpected error:`, error);
  return {
    content: [{ type: "text" as const, text: "Error: Something went wrong while processing this request." }],
    isError: true,
  };
}

interface MappedSite {
  wordpressConnectionId: string;
  label: string;
}

interface GoogleSiteHubExtra {
  [key: string]: unknown;
  organisationId: string | null;
  googleAnalyticsEnabled: boolean;
  googleAnalyticsMappedSites: MappedSite[];
  googleSearchConsoleEnabled: boolean;
  googleSearchConsoleMappedSites: MappedSite[];
}

async function buildMappedSites(
  organisationId: string,
  listMappings: (organisationId: string) => Promise<{ wordpressConnectionId: string }[]>
): Promise<MappedSite[]> {
  const [mappings, connections] = await Promise.all([
    listMappings(organisationId),
    listWordPressConnections(organisationId),
  ]);
  return mappings.map((mapping) => {
    const connection = connections.find((c) => c.connectionId === mapping.wordpressConnectionId);
    return {
      wordpressConnectionId: mapping.wordpressConnectionId,
      label: connection ? (connection.label ? `${connection.label} (${connection.siteUrl})` : connection.siteUrl) : mapping.wordpressConnectionId,
    };
  });
}

async function verifyToken(_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  try {
    const user = await getUserByApiKey(bearerToken);
    if (!user) return undefined;

    const organisation = await getUserOrganisation(user.id);
    const organisationId = organisation?.organisationId ?? null;

    const [googleAnalyticsEnabled, googleSearchConsoleEnabled] = organisationId
      ? await Promise.all([
          isModuleEnabled(organisationId, "google-analytics"),
          isModuleEnabled(organisationId, "google-search-console"),
        ])
      : [false, false];

    const [googleAnalyticsMappedSites, googleSearchConsoleMappedSites] = await Promise.all([
      googleAnalyticsEnabled && organisationId
        ? buildMappedSites(organisationId, listAnalyticsMappingsForOrganisation)
        : Promise.resolve([]),
      googleSearchConsoleEnabled && organisationId
        ? buildMappedSites(organisationId, listSearchConsoleMappingsForOrganisation)
        : Promise.resolve([]),
    ]);

    const extra: GoogleSiteHubExtra = {
      organisationId,
      googleAnalyticsEnabled,
      googleAnalyticsMappedSites,
      googleSearchConsoleEnabled,
      googleSearchConsoleMappedSites,
    };

    return { token: bearerToken, clientId: user.id, scopes: [], extra };
  } catch (error) {
    console.error("[google-mcp] auth threw an error:", error);
    return undefined;
  }
}

const siteSelectionSchema = z.object({ siteId: z.string() });

type ResolvedSite = { ok: true; wordpressConnectionId: string } | { ok: false; elicit: InputRequiredResult };

function extraOf(ctx: ServerContext): GoogleSiteHubExtra | undefined {
  return ctx.http?.authInfo?.extra as GoogleSiteHubExtra | undefined;
}

// Mirrors resolveConnection in app/api/wordpress/mcp/route.ts - see CLAUDE.md's MCP
// elicitation notes. Each module resolves against its own mapped-site list, since
// the two modules' mappings are fully independent even though they share this route.
function resolveSite(
  ctx: ServerContext,
  sites: MappedSite[],
  siteId: number | undefined,
  moduleLabel: string,
  connectPath: string,
  listToolName: string
): ResolvedSite {
  if (sites.length === 0) {
    throw new ToolError(`No WordPress site has an active ${moduleLabel} mapping yet. Visit ${connectPath} to map one, then try again.`);
  }

  if (siteId !== undefined) {
    const match = sites.find((s) => Number(s.wordpressConnectionId) === siteId);
    if (!match) throw new ToolError(`No mapped site with siteId ${siteId}. Call ${listToolName} to see valid site IDs.`);
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

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

/** True only for a real calendar date - the regex above accepts e.g. "2026-02-31". */
function isValidCalendarDate(dateStr: string): boolean {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Shared startDate/endDate resolution for every report tool below - previously each of
 * the 8 handlers repeated `startDate && endDate ? { startDate, endDate } : undefined`,
 * which silently ignored a caller supplying only one of the two (falling back to the
 * default range) rather than surfacing the ambiguity. Centralized here per CLAUDE.md's
 * rule against duplicating the same validation across call sites.
 */
function resolveDateRange(startDate: string | undefined, endDate: string | undefined): { startDate: string; endDate: string } | undefined {
  if (!startDate && !endDate) return undefined;
  if (!startDate || !endDate) {
    throw new ToolError("Provide both startDate and endDate, or neither to use the default range.");
  }
  if (!isValidCalendarDate(startDate) || !isValidCalendarDate(endDate)) {
    throw new ToolError("startDate and endDate must be real calendar dates in YYYY-MM-DD format.");
  }
  if (startDate > endDate) {
    throw new ToolError("startDate must not be after endDate.");
  }
  return { startDate, endDate };
}

function analyticsSiteIdSchema() {
  return z
    .number()
    .int()
    .optional()
    .describe(
      "Which mapped WordPress site to report on, from list_google_analytics_mapped_sites. Optional when only one " +
        "site is mapped. When several are mapped, either supply this or omit it to have the server ask the user to choose."
    );
}

function searchConsoleSiteIdSchema() {
  return z
    .number()
    .int()
    .optional()
    .describe(
      "Which mapped WordPress site to report on, from list_search_console_mapped_sites. Optional when only one " +
        "site is mapped. When several are mapped, either supply this or omit it to have the server ask the user to choose."
    );
}

function reportErrorMessage(
  status: "not_mapped" | "consent_expired" | "temporary_failure" | "unavailable",
  moduleLabel: string,
  connectPath: string
): string {
  switch (status) {
    case "not_mapped":
      return `This site has no active ${moduleLabel} mapping. Visit ${connectPath} to map one.`;
    case "consent_expired":
      return `The connected Google account needs to be reconnected. Visit ${connectPath} to reconnect.`;
    case "temporary_failure":
      return `${moduleLabel} is temporarily unavailable (rate limit or network issue). Try again shortly.`;
    case "unavailable":
      return `${moduleLabel} data is not available for this request right now.`;
  }
}

function createGoogleMcpHandler(extra: GoogleSiteHubExtra) {
  const instructionFragments: string[] = [];
  if (extra.googleAnalyticsEnabled) {
    instructionFragments.push(
      "siteId (from list_google_analytics_mapped_sites) selects which mapped WordPress site a tool reports on - " +
        "it's shared between get_analytics_performance, compare_analytics_periods, get_site_analytics_performance, " +
        "and compare_site_analytics_periods, so a value obtained from list_google_analytics_mapped_sites can be " +
        "reused across calls in the same session. Use get_site_analytics_performance/compare_site_analytics_periods " +
        "for whole-site questions (e.g. \"how is the site doing\"), and get_analytics_performance/" +
        "compare_analytics_periods only when the user means one specific post."
    );
  }
  if (extra.googleSearchConsoleEnabled) {
    instructionFragments.push(
      "siteId (from list_search_console_mapped_sites) selects which mapped WordPress site a tool reports on - " +
        "it's shared between get_search_console_performance, compare_search_console_periods, " +
        "get_site_search_console_performance, and compare_site_search_console_periods, so a value obtained from " +
        "list_search_console_mapped_sites can be reused across calls in the same session. Use " +
        "get_site_search_console_performance/compare_site_search_console_periods for whole-property questions " +
        "(e.g. \"how is the site doing\"), and get_search_console_performance/compare_search_console_periods only " +
        "when the user means one specific post."
    );
  }

  return createMcpHandler(
    (server) => {
      function registerGatedTool(moduleSlug: "google-analytics" | "google-search-console", logPrefix: string): typeof server.registerTool {
        return ((name: string, config: unknown, handler: (...a: unknown[]) => unknown) => {
          return server.registerTool(name, config as never, (async (...handlerArgs: unknown[]) => {
            try {
              const ctx = handlerArgs[handlerArgs.length - 1] as ServerContext;
              const moduleExtra = extraOf(ctx);
              const moduleEnabled = moduleSlug === "google-analytics" ? Boolean(moduleExtra?.googleAnalyticsEnabled) : Boolean(moduleExtra?.googleSearchConsoleEnabled);
              assertModuleEnabled(moduleEnabled, moduleSlug);
            } catch (e) {
              return errorResult(e, logPrefix);
            }
            return handler(...handlerArgs);
          }) as never);
        }) as typeof server.registerTool;
      }

      if (extra.googleAnalyticsEnabled) {
        const registerAnalyticsTool = registerGatedTool("google-analytics", "google-mcp:google-analytics");

        registerAnalyticsTool(
          "list_google_analytics_mapped_sites",
          {
            title: "List Analytics-Mapped Sites",
            description:
              "List the WordPress sites with an active GA4 mapping for this organisation. Call this first when several sites are mapped.",
            inputSchema: z.object({}),
          },
          async (_args, ctx) => {
            try {
              const sites = extraOf(ctx)?.googleAnalyticsMappedSites ?? [];
              return textResult(sites.map((s) => ({ siteId: Number(s.wordpressConnectionId), label: s.label })));
            } catch (e) {
              return errorResult(e, "google-mcp:google-analytics");
            }
          }
        );

        registerAnalyticsTool(
          "get_analytics_performance",
          {
            title: "Get Analytics Performance",
            description:
              "Report GA4 metrics (active users, sessions, engaged sessions, key events) for one WordPress post over a date range. Defaults to the trailing 28 days.",
            inputSchema: z.object({
              siteId: analyticsSiteIdSchema(),
              postId: z.number().int().describe("The WordPress post ID to report on."),
              startDate: dateSchema.optional().describe("Defaults to 28 days before endDate."),
              endDate: dateSchema.optional().describe("Defaults to today."),
            }),
          },
          async ({ siteId, postId, startDate, endDate }, ctx) => {
            try {
              const currentExtra = extraOf(ctx);
              const sites = currentExtra?.googleAnalyticsMappedSites ?? [];
              const resolved = resolveSite(ctx, sites, siteId, "GA4", "/google-analytics/connect", "list_google_analytics_mapped_sites");
              if (!resolved.ok) return resolved.elicit;
              const organisationId = currentExtra?.organisationId;
              if (!organisationId) throw new ToolError("No organisation found for this account.");

              const range = resolveDateRange(startDate, endDate);
              const result = await getAnalyticsPerformance(organisationId, resolved.wordpressConnectionId, postId, range);
              if (result.status !== "ok") throw new ToolError(reportErrorMessage(result.status, "Analytics", "/google-analytics/connect"));
              return textResult(result.data);
            } catch (e) {
              return errorResult(e, "google-mcp:google-analytics");
            }
          }
        );

        registerAnalyticsTool(
          "compare_analytics_periods",
          {
            title: "Compare Analytics Periods",
            description:
              "Compare GA4 metrics for one WordPress post between two equal-length periods, e.g. the latest 28 days versus the previous 28. Defaults to that comparison.",
            inputSchema: z.object({
              siteId: analyticsSiteIdSchema(),
              postId: z.number().int().describe("The WordPress post ID to report on."),
              startDate: dateSchema.optional().describe("Start of the current period. Defaults to 28 days before endDate."),
              endDate: dateSchema.optional().describe("End of the current period. Defaults to today."),
            }),
          },
          async ({ siteId, postId, startDate, endDate }, ctx) => {
            try {
              const currentExtra = extraOf(ctx);
              const sites = currentExtra?.googleAnalyticsMappedSites ?? [];
              const resolved = resolveSite(ctx, sites, siteId, "GA4", "/google-analytics/connect", "list_google_analytics_mapped_sites");
              if (!resolved.ok) return resolved.elicit;
              const organisationId = currentExtra?.organisationId;
              if (!organisationId) throw new ToolError("No organisation found for this account.");

              const range = resolveDateRange(startDate, endDate);
              const result = await compareAnalyticsPeriods(organisationId, resolved.wordpressConnectionId, postId, range);
              if (result.status !== "ok") throw new ToolError(reportErrorMessage(result.status, "Analytics", "/google-analytics/connect"));
              return textResult(result.data);
            } catch (e) {
              return errorResult(e, "google-mcp:google-analytics");
            }
          }
        );

        registerAnalyticsTool(
          "get_site_analytics_performance",
          {
            title: "Get Site-Wide Analytics Performance",
            description:
              "Report GA4 metrics (active users, sessions, engaged sessions, key events) for an entire mapped WordPress site over a date range, not one post. Defaults to the trailing 28 days.",
            inputSchema: z.object({
              siteId: analyticsSiteIdSchema(),
              startDate: dateSchema.optional().describe("Defaults to 28 days before endDate."),
              endDate: dateSchema.optional().describe("Defaults to today."),
            }),
          },
          async ({ siteId, startDate, endDate }, ctx) => {
            try {
              const currentExtra = extraOf(ctx);
              const sites = currentExtra?.googleAnalyticsMappedSites ?? [];
              const resolved = resolveSite(ctx, sites, siteId, "GA4", "/google-analytics/connect", "list_google_analytics_mapped_sites");
              if (!resolved.ok) return resolved.elicit;
              const organisationId = currentExtra?.organisationId;
              if (!organisationId) throw new ToolError("No organisation found for this account.");

              const range = resolveDateRange(startDate, endDate);
              const result = await getSiteAnalyticsPerformance(organisationId, resolved.wordpressConnectionId, range);
              if (result.status !== "ok") throw new ToolError(reportErrorMessage(result.status, "Analytics", "/google-analytics/connect"));
              return textResult(result.data);
            } catch (e) {
              return errorResult(e, "google-mcp:google-analytics");
            }
          }
        );

        registerAnalyticsTool(
          "compare_site_analytics_periods",
          {
            title: "Compare Site-Wide Analytics Periods",
            description:
              "Compare GA4 metrics for an entire mapped WordPress site (not one post) between two equal-length periods, e.g. the latest 28 days versus the previous 28. Defaults to that comparison.",
            inputSchema: z.object({
              siteId: analyticsSiteIdSchema(),
              startDate: dateSchema.optional().describe("Start of the current period. Defaults to 28 days before endDate."),
              endDate: dateSchema.optional().describe("End of the current period. Defaults to today."),
            }),
          },
          async ({ siteId, startDate, endDate }, ctx) => {
            try {
              const currentExtra = extraOf(ctx);
              const sites = currentExtra?.googleAnalyticsMappedSites ?? [];
              const resolved = resolveSite(ctx, sites, siteId, "GA4", "/google-analytics/connect", "list_google_analytics_mapped_sites");
              if (!resolved.ok) return resolved.elicit;
              const organisationId = currentExtra?.organisationId;
              if (!organisationId) throw new ToolError("No organisation found for this account.");

              const range = resolveDateRange(startDate, endDate);
              const result = await compareSiteAnalyticsPeriods(organisationId, resolved.wordpressConnectionId, range);
              if (result.status !== "ok") throw new ToolError(reportErrorMessage(result.status, "Analytics", "/google-analytics/connect"));
              return textResult(result.data);
            } catch (e) {
              return errorResult(e, "google-mcp:google-analytics");
            }
          }
        );
      }

      if (extra.googleSearchConsoleEnabled) {
        const registerSearchConsoleTool = registerGatedTool("google-search-console", "google-mcp:google-search-console");

        registerSearchConsoleTool(
          "list_search_console_mapped_sites",
          {
            title: "List Search-Console-Mapped Sites",
            description:
              "List the WordPress sites with an active Search Console mapping for this organisation. Call this first when several sites are mapped.",
            inputSchema: z.object({}),
          },
          async (_args, ctx) => {
            try {
              const sites = extraOf(ctx)?.googleSearchConsoleMappedSites ?? [];
              return textResult(sites.map((s) => ({ siteId: Number(s.wordpressConnectionId), label: s.label })));
            } catch (e) {
              return errorResult(e, "google-mcp:google-search-console");
            }
          }
        );

        registerSearchConsoleTool(
          "get_search_console_performance",
          {
            title: "Get Search Console Performance",
            description:
              "Report Search Console metrics (clicks, impressions, CTR, average position) for one WordPress post over a date range. Defaults to the trailing 28 days.",
            inputSchema: z.object({
              siteId: searchConsoleSiteIdSchema(),
              postId: z.number().int().describe("The WordPress post ID to report on."),
              startDate: dateSchema.optional().describe("Defaults to 28 days before endDate."),
              endDate: dateSchema.optional().describe("Defaults to today (Pacific Time)."),
            }),
          },
          async ({ siteId, postId, startDate, endDate }, ctx) => {
            try {
              const currentExtra = extraOf(ctx);
              const sites = currentExtra?.googleSearchConsoleMappedSites ?? [];
              const resolved = resolveSite(ctx, sites, siteId, "Search Console", "/google-search-console/connect", "list_search_console_mapped_sites");
              if (!resolved.ok) return resolved.elicit;
              const organisationId = currentExtra?.organisationId;
              if (!organisationId) throw new ToolError("No organisation found for this account.");

              const range = resolveDateRange(startDate, endDate);
              const result = await getSearchConsolePerformance(organisationId, resolved.wordpressConnectionId, postId, range);
              if (result.status !== "ok") throw new ToolError(reportErrorMessage(result.status, "Search Console", "/google-search-console/connect"));
              return textResult(result.data);
            } catch (e) {
              return errorResult(e, "google-mcp:google-search-console");
            }
          }
        );

        registerSearchConsoleTool(
          "compare_search_console_periods",
          {
            title: "Compare Search Console Periods",
            description:
              "Compare Search Console metrics for one WordPress post between two equal-length periods, e.g. the latest 28 days versus the previous 28. Defaults to that comparison.",
            inputSchema: z.object({
              siteId: searchConsoleSiteIdSchema(),
              postId: z.number().int().describe("The WordPress post ID to report on."),
              startDate: dateSchema.optional().describe("Start of the current period. Defaults to 28 days before endDate."),
              endDate: dateSchema.optional().describe("End of the current period. Defaults to today (Pacific Time)."),
            }),
          },
          async ({ siteId, postId, startDate, endDate }, ctx) => {
            try {
              const currentExtra = extraOf(ctx);
              const sites = currentExtra?.googleSearchConsoleMappedSites ?? [];
              const resolved = resolveSite(ctx, sites, siteId, "Search Console", "/google-search-console/connect", "list_search_console_mapped_sites");
              if (!resolved.ok) return resolved.elicit;
              const organisationId = currentExtra?.organisationId;
              if (!organisationId) throw new ToolError("No organisation found for this account.");

              const range = resolveDateRange(startDate, endDate);
              const result = await compareSearchConsolePeriods(organisationId, resolved.wordpressConnectionId, postId, range);
              if (result.status !== "ok") throw new ToolError(reportErrorMessage(result.status, "Search Console", "/google-search-console/connect"));
              return textResult(result.data);
            } catch (e) {
              return errorResult(e, "google-mcp:google-search-console");
            }
          }
        );

        registerSearchConsoleTool(
          "get_site_search_console_performance",
          {
            title: "Get Site-Wide Search Console Performance",
            description:
              "Report Search Console metrics (clicks, impressions, CTR, average position) for an entire mapped property over a date range, not one post. Defaults to the trailing 28 days.",
            inputSchema: z.object({
              siteId: searchConsoleSiteIdSchema(),
              startDate: dateSchema.optional().describe("Defaults to 28 days before endDate."),
              endDate: dateSchema.optional().describe("Defaults to today (Pacific Time)."),
            }),
          },
          async ({ siteId, startDate, endDate }, ctx) => {
            try {
              const currentExtra = extraOf(ctx);
              const sites = currentExtra?.googleSearchConsoleMappedSites ?? [];
              const resolved = resolveSite(ctx, sites, siteId, "Search Console", "/google-search-console/connect", "list_search_console_mapped_sites");
              if (!resolved.ok) return resolved.elicit;
              const organisationId = currentExtra?.organisationId;
              if (!organisationId) throw new ToolError("No organisation found for this account.");

              const range = resolveDateRange(startDate, endDate);
              const result = await getSiteSearchConsolePerformance(organisationId, resolved.wordpressConnectionId, range);
              if (result.status !== "ok") throw new ToolError(reportErrorMessage(result.status, "Search Console", "/google-search-console/connect"));
              return textResult(result.data);
            } catch (e) {
              return errorResult(e, "google-mcp:google-search-console");
            }
          }
        );

        registerSearchConsoleTool(
          "compare_site_search_console_periods",
          {
            title: "Compare Site-Wide Search Console Periods",
            description:
              "Compare Search Console metrics for an entire mapped property (not one post) between two equal-length periods, e.g. the latest 28 days versus the previous 28. Defaults to that comparison.",
            inputSchema: z.object({
              siteId: searchConsoleSiteIdSchema(),
              startDate: dateSchema.optional().describe("Start of the current period. Defaults to 28 days before endDate."),
              endDate: dateSchema.optional().describe("End of the current period. Defaults to today (Pacific Time)."),
            }),
          },
          async ({ siteId, startDate, endDate }, ctx) => {
            try {
              const currentExtra = extraOf(ctx);
              const sites = currentExtra?.googleSearchConsoleMappedSites ?? [];
              const resolved = resolveSite(ctx, sites, siteId, "Search Console", "/google-search-console/connect", "list_search_console_mapped_sites");
              if (!resolved.ok) return resolved.elicit;
              const organisationId = currentExtra?.organisationId;
              if (!organisationId) throw new ToolError("No organisation found for this account.");

              const range = resolveDateRange(startDate, endDate);
              const result = await compareSiteSearchConsolePeriods(organisationId, resolved.wordpressConnectionId, range);
              if (result.status !== "ok") throw new ToolError(reportErrorMessage(result.status, "Search Console", "/google-search-console/connect"));
              return textResult(result.data);
            } catch (e) {
              return errorResult(e, "google-mcp:google-search-console");
            }
          }
        );
      }
    },
    { instructions: instructionFragments.join(" ") || undefined }
  );
}

const handler = withMcpAuth(
  (req) => createGoogleMcpHandler((req.auth?.extra as GoogleSiteHubExtra | undefined) ?? {
    organisationId: null,
    googleAnalyticsEnabled: false,
    googleAnalyticsMappedSites: [],
    googleSearchConsoleEnabled: false,
    googleSearchConsoleMappedSites: [],
  })(req),
  verifyToken,
  { required: true }
);

export const maxDuration = 60;

export { handler as GET, handler as POST };
