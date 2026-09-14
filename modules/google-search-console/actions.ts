"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModuleEnabledForUser } from "@/lib/entitlements";
import { getUserOrganisation } from "@/lib/organisation";
import { getCurrentUser } from "@/lib/session";
import { disconnectOrDelete, revokeConnection, startAuthorization } from "@/modules/google-connections";
import { createOrReplaceMapping } from "@/modules/google-search-console/mappings";

const CAPABILITY = "google-search-console" as const;
const CONNECT_PATH = "/google-search-console/connect";

export interface MappingState {
  error: string | null;
  success: boolean;
}

async function requireAdmin(): Promise<{ userId: string; organisationId: string }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be logged in.");

  const entitlement = await requireModuleEnabledForUser(user.id, CAPABILITY);
  if (!entitlement.ok) throw new Error("Google Search Console isn't included in your organisation's plan.");

  const organisation = await getUserOrganisation(user.id);
  if (!organisation || organisation.role !== "admin") {
    throw new Error("Only organisation admins can manage this connection.");
  }
  return { userId: user.id, organisationId: organisation.organisationId };
}

export async function connectGoogleAction(): Promise<void> {
  const { userId, organisationId } = await requireAdmin();
  const { authorizationUrl } = await startAuthorization(userId, organisationId, CAPABILITY, { type: "connect" });
  redirect(authorizationUrl);
}

export async function reconnectGoogleAction(formData: FormData): Promise<void> {
  const { userId, organisationId } = await requireAdmin();
  const connectionId = String(formData.get("connectionId") ?? "");
  if (!connectionId) throw new Error("Missing connection.");
  const { authorizationUrl } = await startAuthorization(userId, organisationId, CAPABILITY, {
    type: "reconnect",
    connectionId,
  });
  redirect(authorizationUrl);
}

export async function disconnectGoogleAction(formData: FormData): Promise<void> {
  const { userId, organisationId } = await requireAdmin();
  const connectionId = String(formData.get("connectionId") ?? "");
  if (!connectionId) throw new Error("Missing connection.");
  await disconnectOrDelete(organisationId, connectionId, userId);
  redirect(CONNECT_PATH);
}

export async function revokeGoogleAction(formData: FormData): Promise<void> {
  const { userId, organisationId } = await requireAdmin();
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
    ctx = await requireAdmin();
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
