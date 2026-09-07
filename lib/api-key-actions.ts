"use server";

import { z } from "zod";
import { createApiKey, deleteApiKey } from "./api-keys";
import { getCurrentUser } from "./session";

export interface CreateApiKeyState {
  error: string | null;
  key: { id: string; name: string; createdAt: string } | null;
  rawKey: string | null;
}

export interface DeleteApiKeyState {
  error: string | null;
  success: boolean;
}

const nameSchema = z.string().trim().min(1, "Name is required.").max(100);

export async function createApiKeyAction(
  _prevState: CreateApiKeyState,
  formData: FormData
): Promise<CreateApiKeyState> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "You must be logged in.", key: null, rawKey: null };
  }

  const parsed = nameSchema.safeParse(formData.get("name"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid name.", key: null, rawKey: null };
  }

  const { key, rawKey } = await createApiKey(user.id, parsed.data);
  return { error: null, key, rawKey };
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
