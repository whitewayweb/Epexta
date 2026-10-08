"use server";

import { z } from "zod";
import { createApiKey, deleteApiKey } from "./api-keys";
import { getCurrentUser } from "./session";

export interface CreateApiKeyState {
  error: string | null;
  key: { id: string; name: string; createdAt: string } | null;
}

export interface DeleteApiKeyState {
  error: string | null;
  success: boolean;
}

const nameSchema = z.string().trim().min(1, "Name is required.").max(100);
// The raw key is generated client-side (crypto.getRandomValues, 32 bytes as hex) and
// shown to the user before this action ever runs - this just checks it looks like that,
// not a real secret the server is trusting blindly.
const rawKeySchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{32,}$/, "Invalid key.");

export async function createApiKeyAction(
  _prevState: CreateApiKeyState,
  formData: FormData
): Promise<CreateApiKeyState> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "You must be logged in.", key: null };
  }

  const parsedName = nameSchema.safeParse(formData.get("name"));
  if (!parsedName.success) {
    return { error: parsedName.error.issues[0]?.message ?? "Invalid name.", key: null };
  }
  const parsedRawKey = rawKeySchema.safeParse(formData.get("rawKey"));
  if (!parsedRawKey.success) {
    return { error: "Invalid key. Reopen the dialog and try again.", key: null };
  }

  const key = await createApiKey(user.id, parsedName.data, parsedRawKey.data);
  return { error: null, key };
}

export async function deleteApiKeyAction(
  _prevState: DeleteApiKeyState,
  formData: FormData
): Promise<DeleteApiKeyState> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "You must be logged in.", success: false };
  }

  const keyId = String(formData.get("keyId") ?? "");
  if (!keyId) {
    return { error: "Missing key.", success: false };
  }

  try {
    await deleteApiKey(user.id, keyId);
  } catch {
    return { error: "Could not delete that key.", success: false };
  }

  return { error: null, success: true };
}
