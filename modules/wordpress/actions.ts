"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPayloadClient } from "@/lib/payload";
import { getCurrentUser } from "@/lib/session";
import {
  addOrganisationMember,
  createOrganisationForUser,
  getUserOrganisation,
  removeOrganisationMember,
} from "@/lib/organisation";
import { createWordPressConnection, deleteWordPressConnection, updateWordPressConnection } from "./organisation";

export interface ConnectionState {
  error: string | null;
  success: boolean;
}

export interface MemberActionState {
  error: string | null;
  success: boolean;
}

const connectionFields = {
  siteUrl: z
    .string()
    .trim()
    .min(1, "Site URL is required.")
    .url("Enter a valid URL, e.g. https://example.com")
    .transform((value) => value.replace(/\/+$/, "")),
  username: z.string().trim().min(1, "WordPress username is required."),
  label: z.string().trim().optional(),
};

const connectionSchema = z.object({
  ...connectionFields,
  appPassword: z.string().trim().min(1, "Application Password is required."),
});

// Editing a connection shouldn't force re-entering the Application Password - leaving it
// blank keeps whatever is already saved.
const updateConnectionSchema = z.object({
  ...connectionFields,
  appPassword: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined)),
});

const inviteSchema = z.object({
  email: z.string().trim().min(1, "Email is required.").email("Enter a valid email address."),
});

function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}

function parseConnectionForm(formData: FormData) {
  return connectionSchema.safeParse({
    siteUrl: formData.get("siteUrl"),
    username: formData.get("username"),
    appPassword: formData.get("appPassword"),
    label: formData.get("label"),
  });
}

function parseUpdateConnectionForm(formData: FormData) {
  return updateConnectionSchema.safeParse({
    siteUrl: formData.get("siteUrl"),
    username: formData.get("username"),
    appPassword: formData.get("appPassword"),
    label: formData.get("label"),
  });
}

export async function addConnectionAction(
  _prevState: ConnectionState,
  formData: FormData
): Promise<ConnectionState> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "You must be logged in.", success: false };
  }

  const parsed = parseConnectionForm(formData);
  if (!parsed.success) {
    return { error: firstIssueMessage(parsed.error), success: false };
  }

  let organisation = await getUserOrganisation(user.id);
  if (organisation && organisation.role !== "admin") {
    return { error: "Only organisation admins can add a site.", success: false };
  }
  if (!organisation) {
    const organisationId = await createOrganisationForUser(user.id);
    organisation = { organisationId, role: "admin" };
  }

  try {
    await createWordPressConnection(organisation.organisationId, parsed.data);
  } catch {
    return { error: "Could not save the connection. Check the site URL and try again.", success: false };
  }

  revalidatePath("/wordpress");
  revalidatePath("/wordpress/connect");
  return { error: null, success: true };
}

export async function updateConnectionAction(
  _prevState: ConnectionState,
  formData: FormData
): Promise<ConnectionState> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "You must be logged in.", success: false };
  }

  const organisation = await getUserOrganisation(user.id);
  if (!organisation || organisation.role !== "admin") {
    return { error: "Only organisation admins can edit a connection.", success: false };
  }

  const connectionId = String(formData.get("connectionId") ?? "");
  if (!connectionId) {
    return { error: "Missing connection.", success: false };
  }

  const parsed = parseUpdateConnectionForm(formData);
  if (!parsed.success) {
    return { error: firstIssueMessage(parsed.error), success: false };
  }

  try {
    await updateWordPressConnection(organisation.organisationId, connectionId, parsed.data);
  } catch {
    return { error: "Could not save the connection. Check the site URL and try again.", success: false };
  }

  revalidatePath("/wordpress");
  revalidatePath("/wordpress/connect");
  return { error: null, success: true };
}

export async function removeConnectionAction(
  _prevState: ConnectionState,
  formData: FormData
): Promise<ConnectionState> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "You must be logged in.", success: false };
  }

  const organisation = await getUserOrganisation(user.id);
  if (!organisation || organisation.role !== "admin") {
    return { error: "Only organisation admins can remove a connection.", success: false };
  }

  const connectionId = String(formData.get("connectionId") ?? "");
  if (!connectionId) {
    return { error: "Missing connection.", success: false };
  }

  try {
    await deleteWordPressConnection(organisation.organisationId, connectionId);
  } catch {
    return { error: "Could not remove the connection.", success: false };
  }

  revalidatePath("/wordpress");
  revalidatePath("/wordpress/connect");
  return { error: null, success: true };
}

export async function inviteMemberAction(
  _prevState: MemberActionState,
  formData: FormData
): Promise<MemberActionState> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "You must be logged in.", success: false };
  }

  const organisation = await getUserOrganisation(user.id);
  if (!organisation || organisation.role !== "admin") {
    return { error: "Only organisation admins can invite members.", success: false };
  }

  const parsed = inviteSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: firstIssueMessage(parsed.error), success: false };
  }

  const payload = await getPayloadClient();
  const found = await payload.find({
    collection: "users",
    where: { email: { equals: parsed.data.email } },
    limit: 1,
    overrideAccess: true,
  });
  const invitedUser = found.docs[0];
  if (!invitedUser) {
    return { error: "That person needs to sign up for an account first.", success: false };
  }

  const result = await addOrganisationMember(organisation.organisationId, String(invitedUser.id), "member");
  return { error: result.error ?? null, success: result.ok };
}

export async function removeMemberAction(
  _prevState: MemberActionState,
  formData: FormData
): Promise<MemberActionState> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "You must be logged in.", success: false };
  }

  const organisation = await getUserOrganisation(user.id);
  if (!organisation || organisation.role !== "admin") {
    return { error: "Only organisation admins can remove members.", success: false };
  }

  const targetUserId = String(formData.get("userId") ?? "");
  if (!targetUserId) {
    return { error: "Missing member.", success: false };
  }

  const result = await removeOrganisationMember(organisation.organisationId, targetUserId);
  return { error: result.error ?? null, success: result.ok };
}
