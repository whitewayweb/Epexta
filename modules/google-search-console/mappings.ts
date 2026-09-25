import { runInTransaction } from "../../lib/db-transactions";
import { getPayloadClient } from "../../lib/payload";
import { getConnectionForCapability } from "../google-connections";
import { getWordPressConnection } from "../wordpress/organisation";

export interface SearchConsoleMapping {
  mappingId: string;
  wordpressConnectionId: string;
  googleConnectionId: string;
  searchConsolePropertyUrl: string;
  status: "active" | "needs_reconnect" | "needs_remapping" | "superseded";
  lastValidatedAt: string | null;
}

interface MappingDoc {
  id: string | number;
  wordpressConnection: unknown;
  googleConnection: unknown;
  searchConsolePropertyUrl: string;
  status: "active" | "needs_reconnect" | "needs_remapping" | "superseded";
  lastValidatedAt?: string | null;
}

function toMapping(doc: MappingDoc): SearchConsoleMapping {
  return {
    mappingId: String(doc.id),
    wordpressConnectionId: String(doc.wordpressConnection),
    googleConnectionId: String(doc.googleConnection),
    searchConsolePropertyUrl: doc.searchConsolePropertyUrl,
    status: doc.status,
    lastValidatedAt: doc.lastValidatedAt ?? null,
  };
}

export async function listMappingsForOrganisation(organisationId: string): Promise<SearchConsoleMapping[]> {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "google-search-console-mappings",
    where: { organisation: { equals: organisationId }, status: { equals: "active" } },
    depth: 0,
    limit: 100,
    overrideAccess: true,
  });
  return result.docs.map((doc) => toMapping(doc as unknown as MappingDoc));
}

export async function getActiveMappingForWordPressConnection(
  organisationId: string,
  wordpressConnectionId: string
): Promise<SearchConsoleMapping | null> {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "google-search-console-mappings",
    where: {
      organisation: { equals: organisationId },
      wordpressConnection: { equals: wordpressConnectionId },
      status: { equals: "active" },
    },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  });
  const doc = result.docs[0];
  return doc ? toMapping(doc as unknown as MappingDoc) : null;
}

export interface CreateMappingInput {
  wordpressConnectionId: string;
  googleConnectionId: string;
  searchConsolePropertyUrl: string;
}

/**
 * Replacing a mapping is one transaction, and the order inside it matters: supersede
 * the previous active row first, then insert the new row as active. Inserting first
 * would have two active rows for the same wordpress_connection_id exist simultaneously
 * inside the transaction, which the partial unique index rejects outright. See
 * "Mappings are capability-specific" in GOOGLE_PERFORMANCE_PLAN.md.
 */
export async function createOrReplaceMapping(
  organisationId: string,
  input: CreateMappingInput,
  confirmedByUserId: string
): Promise<{ mappingId: string }> {
  const wordpressConnection = await getWordPressConnection(organisationId, input.wordpressConnectionId);
  if (!wordpressConnection) throw new Error("WordPress connection not found for this organisation.");

  const googleConnection = await getConnectionForCapability(
    organisationId,
    input.googleConnectionId,
    "google-search-console"
  );
  if (!googleConnection) throw new Error("Google connection not found for this organisation/capability.");

  const payload = await getPayloadClient();
  return runInTransaction(async (req) => {
    const existing = await payload.find({
      collection: "google-search-console-mappings",
      where: {
        organisation: { equals: organisationId },
        wordpressConnection: { equals: input.wordpressConnectionId },
        status: { equals: "active" },
      },
      depth: 0,
      limit: 1,
      req,
      overrideAccess: true,
    });
    const previous = existing.docs[0];

    if (previous) {
      await payload.update({
        collection: "google-search-console-mappings",
        id: previous.id,
        data: { status: "superseded", replacedAt: new Date().toISOString() },
        req,
        overrideAccess: true,
      });
    }

    const created = await payload.create({
      collection: "google-search-console-mappings",
      data: {
        organisation: Number(organisationId),
        wordpressConnection: Number(input.wordpressConnectionId),
        googleConnection: Number(input.googleConnectionId),
        searchConsolePropertyUrl: input.searchConsolePropertyUrl,
        confirmedBy: Number(confirmedByUserId),
        confirmedAt: new Date().toISOString(),
        status: "active",
      },
      req,
      overrideAccess: true,
    });

    if (previous) {
      await payload.update({
        collection: "google-search-console-mappings",
        id: previous.id,
        data: { replacedBy: created.id },
        req,
        overrideAccess: true,
      });
    }

    return { mappingId: String(created.id) };
  });
}
