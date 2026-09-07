"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getPayloadClient } from "./payload";
import { createOrganisationForUser } from "./organisation";
import { clearSessionCookie, setSessionCookie } from "./session";

export interface AuthState {
  error: string | null;
}

const credentialsSchema = z.object({
  email: z.string().trim().min(1, "Email is required.").email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}

/** Only ever redirect to a same-site path, so a `redirectTo` field can't be used as an open redirect. */
function safeRedirectTarget(raw: FormDataEntryValue | null): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
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
  const redirectTo = safeRedirectTarget(formData.get("redirectTo"));
  const organisationNameRaw = formData.get("organisationName");
  const organisationName = typeof organisationNameRaw === "string" ? organisationNameRaw.trim() : "";

  const payload = await getPayloadClient();
  let userId: string;
  try {
    // `role` is required by the generated type; the collection's beforeChange hook
    // (Users.ts) overwrites it regardless (superadmin only for the bootstrap first user).
    const user = await payload.create({ collection: "users", data: { email, password, role: "customer" } });
    userId = String(user.id);
  } catch {
    return { error: "Could not create an account with that email." };
  }

  await createOrganisationForUser(userId, organisationName);

  const result = await payload.login({ collection: "users", data: { email, password } });
  if (!result.token) {
    return { error: "Account created, but automatic login failed. Please log in." };
  }
  await setSessionCookie(result.token, result.exp);
  redirect(redirectTo);
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
  const redirectTo = safeRedirectTarget(formData.get("redirectTo"));

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
  redirect(redirectTo);
}

export async function logoutAction(formData: FormData): Promise<void> {
  await clearSessionCookie();
  redirect(safeRedirectTarget(formData.get("redirectTo")));
}
