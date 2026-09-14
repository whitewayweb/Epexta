"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrganisationAdmin, requireOrganisationMember } from "@/lib/module-access";
import { disconnectOrDelete, revokeConnection, startAuthorization } from "@/modules/google-connections";
import { createOrReplaceMapping } from "@/modules/google-search-console/mappings";
import { getPostPerformance, type PostPerformanceData } from "@/modules/google-search-console/reporting";

const CAPABILITY = "google-search-console" as const;
const MODULE_LABEL = "Google Search Console";
const CONNECT_PATH = "/google-search-console/connect";

export interface MappingState {
  error: string | null;
  success: boolean;
}

export interface PerformanceState {
  error: string | null;
  data: PostPerformanceData | null;
}

const performanceSchema = z.object({
  wordpressConnectionId: z.string().trim().min(1, "Select a site."),
  postId: z.coerce.number().int().positive("Enter a valid WordPress post ID."),
});

export async function getPerformanceAction(_prevState: PerformanceState, formData: FormData): Promise<PerformanceState> {
  let ctx: { userId: string; organisationId: string };
  try {
    ctx = await requireOrganisationMember(CAPABILITY, MODULE_LABEL);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Not allowed.", data: null };
  }

  const parsed = performanceSchema.safeParse({
    wordpressConnectionId: formData.get("wordpressConnectionId"),
    postId: formData.get("postId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input.", data: null };
  }

  const result = await getPostPerformance(ctx.organisationId, parsed.data.wordpressConnectionId, parsed.data.postId);
  if (result.status !== "ok") {
    const messages: Record<Exclude<typeof result.status, "ok">, string> = {
      not_mapped: "This site has no active Search Console mapping.",
      consent_expired: "The connected Google account needs to be reconnected.",
      temporary_failure: "Search Console is temporarily unavailable. Try again shortly.",
      unavailable: "No data is available for this post yet.",
    };
    return { error: messages[result.status], data: null };
  }

  return { error: null, data: result.data };
}

export async function connectGoogleAction(): Promise<void> {
  const { userId, organisationId } = await requireOrganisationAdmin(CAPABILITY, MODULE_LABEL);
  const { authorizationUrl } = await startAuthorization(userId, organisationId, CAPABILITY, { type: "connect" });
  redirect(authorizationUrl);
}

export async function reconnectGoogleAction(formData: FormData): Promise<void> {
  const { userId, organisationId } = await requireOrganisationAdmin(CAPABILITY, MODULE_LABEL);
  const connectionId = String(formData.get("connectionId") ?? "");
  if (!connectionId) throw new Error("Missing connection.");
  const { authorizationUrl } = await startAuthorization(userId, organisationId, CAPABILITY, {
    type: "reconnect",
    connectionId,
  });
  redirect(authorizationUrl);
}

export async function disconnectGoogleAction(formData: FormData): Promise<void> {
  const { userId, organisationId } = await requireOrganisationAdmin(CAPABILITY, MODULE_LABEL);
  const connectionId = String(formData.get("connectionId") ?? "");
  if (!connectionId) throw new Error("Missing connection.");
  await disconnectOrDelete(organisationId, connectionId, userId);
  redirect(CONNECT_PATH);
}

export async function revokeGoogleAction(formData: FormData): Promise<void> {
  const { userId, organisationId } = await requireOrganisationAdmin(CAPABILITY, MODULE_LABEL);
  const connectionId = String(formData.get("connectionId") ?? "");
  if (!connectionId) throw new Error("Missing connection.");
  await revokeConnection(organisationId, connectionId, userId);
  redirect(CONNECT_PATH);
}

const mappingSchema = z.object({
  wordpressConnectionId: z.string().trim().min(1, "Select a WordPress site."),
  googleConnectionId: z.string().trim().min(1, "Select a Google account."),
  searchConsolePropertyUrl: z.string().trim().min(1, "Enter or select a Search Console property."),
});

export async function saveMappingAction(_prevState: MappingState, formData: FormData): Promise<MappingState> {
  let ctx: { userId: string; organisationId: string };
  try {
    ctx = await requireOrganisationAdmin(CAPABILITY, MODULE_LABEL);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Not allowed.", success: false };
  }

  const parsed = mappingSchema.safeParse({
    wordpressConnectionId: formData.get("wordpressConnectionId"),
    googleConnectionId: formData.get("googleConnectionId"),
    searchConsolePropertyUrl: formData.get("searchConsolePropertyUrl"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input.", success: false };
  }

  try {
    await createOrReplaceMapping(ctx.organisationId, parsed.data, ctx.userId);
  } catch {
    return { error: "Could not save this mapping. Check the property and try again.", success: false };
  }

  return { error: null, success: true };
}
