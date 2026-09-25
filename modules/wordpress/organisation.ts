import { getPayloadClient } from "@/lib/payload";
import { relationshipId } from "@/lib/relationship";
import { MODULES } from "@/lib/modules";
import { referencingCapabilitiesForWordPressConnection } from "@/modules/google-connections/registry";
import type { WordpressConnection as WordPressConnectionDoc } from "@/payload-types";

/**
 * Thrown by deleteWordPressConnection when a Google Site Hub module (google-search-console,
 * google-analytics) still has mapping history pointing at this connection. Deleting the
 * connection anyway would silently cascade-delete that mapping history via the FK's
 * ON DELETE CASCADE (see migrations/20260914_095814_cascade_delete_fks.ts) - this stops
 * that instead of letting it happen unnoticed, mirroring how disconnectOrDelete in
 * modules/google-connections/index.ts already protects a referenced Google connection.
 */
export class WordPressConnectionInUseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WordPressConnectionInUseError";
  }
}

export type SeoProviderPreference = "auto" | "yoast" | "rank-math" | "aioseo";
export type SeoProfileStateField = "confirmed" | "selected" | "ambiguous" | "unknown" | "unsupported" | "unavailable";

export interface WordPressConnection {
  connectionId: string;
  label: string;
  siteUrl: string;
  username: string;
  appPassword: string;
  seoProviderPreference: SeoProviderPreference;
  seoProfileState: SeoProfileStateField | null;
  seoProviderObserved: "yoast" | "rank-math" | "aioseo" | null;
  seoProfileEvidence: unknown;
  seoProfileObservedAt: string | null;
  seoProfileError: string | null;
}

// Application Passwords never leave the server - this is the shape safe to hand to a
// client component or render on a page.
export type DisplayConnection = Omit<WordPressConnection, "appPassword">;

export interface WordPressConnectionInput {
  siteUrl: string;
  username: string;
  appPassword: string;
  label?: string;
}

export interface WordPressConnectionUpdateInput {
  siteUrl: string;
  username: string;
  // Omitted (rather than an empty string) means "keep the currently saved password".
  appPassword?: string;
  label?: string;
}

function toConnection(doc: WordPressConnectionDoc): WordPressConnection {
  return {
    connectionId: String(doc.id),
    label: String(doc.label ?? ""),
    siteUrl: String(doc.siteUrl),
    username: String(doc.username),
    appPassword: String(doc.appPassword),
    seoProviderPreference: (doc.seoProviderPreference as SeoProviderPreference | undefined) ?? "auto",
    seoProfileState: (doc.seoProfileState as SeoProfileStateField | undefined) ?? null,
    seoProviderObserved: (doc.seoProviderObserved as WordPressConnection["seoProviderObserved"]) ?? null,
    seoProfileEvidence: doc.seoProfileEvidence ?? null,
    seoProfileObservedAt: doc.seoProfileObservedAt ?? null,
    seoProfileError: doc.seoProfileError ?? null,
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

  if (relationshipId(doc.organisation) !== organisationId) return null;

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
  data: WordPressConnectionUpdateInput
): Promise<void> {
  const existing = await getWordPressConnection(organisationId, connectionId);
  if (!existing) throw new Error("Connection not found for this organisation.");

  const payload = await getPayloadClient();
  await payload.update({
    collection: "wordpress-connections",
    id: connectionId,
    // Leaving appPassword out of the update entirely keeps the encrypted value already stored.
    data: data.appPassword ? data : { siteUrl: data.siteUrl, username: data.username, label: data.label },
    overrideAccess: true,
  });
}

export async function deleteWordPressConnection(organisationId: string, connectionId: string): Promise<void> {
  const existing = await getWordPressConnection(organisationId, connectionId);
  if (!existing) throw new Error("Connection not found for this organisation.");

  const referencingCapabilities = await referencingCapabilitiesForWordPressConnection(connectionId);
  if (referencingCapabilities.length > 0) {
    const names = referencingCapabilities.map((slug) => MODULES.find((m) => m.slug === slug)?.name ?? slug);
    throw new WordPressConnectionInUseError(
      `This site still has ${names.join(" and ")} mapping history. Remove ${names.length > 1 ? "those mappings" : "that mapping"} first, then delete the connection.`
    );
  }

  const payload = await getPayloadClient();
  await payload.delete({
    collection: "wordpress-connections",
    id: connectionId,
    overrideAccess: true,
  });
}
