import crypto from "crypto";
import { getPayloadClient } from "./payload";
import type { ApiKey } from "@/payload-types";

export interface DisplayApiKey {
  id: string;
  name: string;
  createdAt: string;
}

function hashKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

function toDisplay(doc: ApiKey): DisplayApiKey {
  return { id: String(doc.id), name: doc.name, createdAt: doc.createdAt };
}

export async function listApiKeys(userId: string): Promise<DisplayApiKey[]> {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "api-keys",
    where: { user: { equals: Number(userId) } },
    sort: "-createdAt",
    limit: 100,
    overrideAccess: true,
  });
  return result.docs.map(toDisplay);
}

/** Stores a key generated client-side (see api-keys-table.tsx) under this name. */
export async function createApiKey(userId: string, name: string, rawKey: string): Promise<DisplayApiKey> {
  const payload = await getPayloadClient();
  const doc = await payload.create({
    collection: "api-keys",
    data: { user: Number(userId), name, hashedKey: hashKey(rawKey) },
    overrideAccess: true,
  });
  return toDisplay(doc);
}

export async function deleteApiKey(userId: string, keyId: string): Promise<void> {
  const payload = await getPayloadClient();
  const doc = await payload.findByID({ collection: "api-keys", id: keyId, overrideAccess: true }).catch(() => null);
  if (!doc) throw new Error("API key not found.");

  const ownerId = typeof doc.user === "object" ? String((doc.user as { id: unknown }).id) : String(doc.user);
  if (ownerId !== userId) throw new Error("API key not found.");

  await payload.delete({ collection: "api-keys", id: keyId, overrideAccess: true });
}

/** Resolves the user that owns this raw API key, or null if it doesn't match any stored key. */
export async function getUserByApiKey(rawKey: string): Promise<{ id: string; email: string } | null> {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "api-keys",
    where: { hashedKey: { equals: hashKey(rawKey) } },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  });

  const doc = result.docs[0];
  if (!doc) return null;

  const user = doc.user;
  if (typeof user !== "object" || !user) return null;
  return { id: String((user as { id: unknown }).id), email: String((user as { email: unknown }).email) };
}
