import { getPayloadClient } from "@/lib/payload";
import type { WordpressConnection as WordPressConnectionDoc } from "@/payload-types";

export interface WordPressConnection {
  connectionId: string;
  label: string;
  siteUrl: string;
  username: string;
  appPassword: string;
}

export interface WordPressConnectionInput {
  siteUrl: string;
  username: string;
  appPassword: string;
  label?: string;
}

function toConnection(doc: WordPressConnectionDoc): WordPressConnection {
  return {
    connectionId: String(doc.id),
    label: String(doc.label ?? ""),
    siteUrl: String(doc.siteUrl),
    username: String(doc.username),
    appPassword: String(doc.appPassword),
  };
}

export async function listWordPressConnections(organisationId: string): Promise<WordPressConnection[]> {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "wordpress-connections",
    where: { organisation: { equals: Number(organisationId) } },
    sort: "createdAt",
    limit: 100,
    overrideAccess: true,
  });

  return result.docs.map(toConnection);
}

/** Fetches one connection, scoped to the given organisation so a caller can't reach another org's site. */
export async function getWordPressConnection(
  organisationId: string,
  connectionId: string
): Promise<WordPressConnection | null> {
  const payload = await getPayloadClient();
  const doc = await payload
    .findByID({ collection: "wordpress-connections", id: connectionId, overrideAccess: true })
    .catch(() => null);
  if (!doc) return null;

  // `organisation` comes back as a populated doc or a raw id depending on depth.
  const docOrgId = typeof doc.organisation === "object" ? String((doc.organisation as { id: unknown }).id) : String(doc.organisation);
  if (docOrgId !== organisationId) return null;

  return toConnection(doc);
}

export async function createWordPressConnection(
  organisationId: string,
  data: WordPressConnectionInput
): Promise<void> {
  const payload = await getPayloadClient();
  await payload.create({
    collection: "wordpress-connections",
    data: { ...data, organisation: Number(organisationId) },
    overrideAccess: true,
  });
}

export async function updateWordPressConnection(
  organisationId: string,
  connectionId: string,
  data: WordPressConnectionInput
): Promise<void> {
  const existing = await getWordPressConnection(organisationId, connectionId);
  if (!existing) throw new Error("Connection not found for this organisation.");

  const payload = await getPayloadClient();
  await payload.update({
    collection: "wordpress-connections",
    id: connectionId,
    data,
    overrideAccess: true,
  });
}

export async function deleteWordPressConnection(organisationId: string, connectionId: string): Promise<void> {
  const existing = await getWordPressConnection(organisationId, connectionId);
  if (!existing) throw new Error("Connection not found for this organisation.");

  const payload = await getPayloadClient();
  await payload.delete({
    collection: "wordpress-connections",
    id: connectionId,
    overrideAccess: true,
  });
}
