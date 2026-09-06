"use server";

import crypto from "crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getPayloadClient } from "@/lib/payload";
import { clearSessionCookie, getCurrentUser, setSessionCookie } from "@/lib/session";
import { addTenantMember, createTenantForUser, getUserTenant, removeTenantMember } from "@/lib/tenant";
import { saveWordPressConnection } from "./tenant";

export interface AuthState {
  error: string | null;
}

export interface ConnectionState {
  error: string | null;
  success: boolean;
}

export interface ApiKeyState {
  apiKey: string | null;
  error: string | null;
}

export interface MemberActionState {
  error: string | null;
  success: boolean;
}

const credentialsSchema = z.object({
  email: z.string().trim().min(1, "Email is required.").email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

const connectionSchema = z.object({
  siteUrl: z
    .string()
    .trim()
    .min(1, "Site URL is required.")
    .url("Enter a valid URL, e.g. https://example.com")
    .transform((value) => value.replace(/\/+$/, "")),
  username: z.string().trim().min(1, "WordPress username is required."),
  appPassword: z.string().trim().min(1, "Application Password is required."),
});

const inviteSchema = z.object({
  email: z.string().trim().min(1, "Email is required.").email("Enter a valid email address."),
});

function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}

export async function signupAction(_prevState: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: firstIssueMessage(parsed.error) };
  }
  const { email, password } = parsed.data;

  const payload = await getPayloadClient();
  try {
    await payload.create({ collection: "users", data: { email, password } });
  } catch {
    return { error: "Could not create an account with that email." };
  }

  const result = await payload.login({ collection: "users", data: { email, password } });
  if (!result.token) {
    return { error: "Account created, but automatic login failed. Please log in." };
  }
  await setSessionCookie(result.token, result.exp);
  redirect("/wordpress/connect");
}

export async function loginAction(_prevState: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: firstIssueMessage(parsed.error) };
  }
  const { email, password } = parsed.data;

  const payload = await getPayloadClient();
  try {
    const result = await payload.login({ collection: "users", data: { email, password } });
    if (!result.token) {
      return { error: "Invalid email or password." };
    }
    await setSessionCookie(result.token, result.exp);
  } catch {
    return { error: "Invalid email or password." };
  }
  redirect("/wordpress/connect");
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/wordpress/connect");
}

export async function saveConnectionAction(
  _prevState: ConnectionState,
  formData: FormData
): Promise<ConnectionState> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "You must be logged in.", success: false };
  }

  const parsed = connectionSchema.safeParse({
    siteUrl: formData.get("siteUrl"),
    username: formData.get("username"),
    appPassword: formData.get("appPassword"),
  });
  if (!parsed.success) {
    return { error: firstIssueMessage(parsed.error), success: false };
  }

  let tenant = await getUserTenant(user.id);
  if (tenant && tenant.role !== "admin") {
    return { error: "Only tenant admins can edit the connection.", success: false };
  }
  if (!tenant) {
    const tenantId = await createTenantForUser(user.id);
    tenant = { tenantId, role: "admin" };
  }

  try {
    await saveWordPressConnection(tenant.tenantId, parsed.data);
  } catch {
    return { error: "Could not save the connection. Check the site URL and try again.", success: false };
  }

  return { error: null, success: true };
}

export async function generateApiKeyAction(
  _prevState: ApiKeyState,
  _formData: FormData
): Promise<ApiKeyState> {
  const user = await getCurrentUser();
  if (!user) {
    return { apiKey: null, error: "You must be logged in." };
  }

  const apiKey = crypto.randomBytes(32).toString("hex");
  const payload = await getPayloadClient();
  await payload.update({
    collection: "users",
    id: user.id,
    data: { enableAPIKey: true, apiKey },
    overrideAccess: true,
  });

  return { apiKey, error: null };
}

export async function inviteMemberAction(
  _prevState: MemberActionState,
  formData: FormData
): Promise<MemberActionState> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "You must be logged in.", success: false };
  }

  const tenant = await getUserTenant(user.id);
  if (!tenant || tenant.role !== "admin") {
    return { error: "Only tenant admins can invite members.", success: false };
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

  const result = await addTenantMember(tenant.tenantId, String(invitedUser.id), "member");
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

  const tenant = await getUserTenant(user.id);
  if (!tenant || tenant.role !== "admin") {
    return { error: "Only tenant admins can remove members.", success: false };
  }

  const targetUserId = String(formData.get("userId") ?? "");
  if (!targetUserId) {
    return { error: "Missing member.", success: false };
  }

  const result = await removeTenantMember(tenant.tenantId, targetUserId);
  return { error: result.error ?? null, success: result.ok };
}
