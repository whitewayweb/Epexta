import { runInTransaction } from "../../lib/db-transactions";
import { getPayloadClient } from "../../lib/payload";
import { getConnectionForCapability } from "../google-connections";
import { getWordPressConnection } from "../wordpress/organisation";

export interface AnalyticsMapping {
  mappingId: string;
  wordpressConnectionId: string;
  googleConnectionId: string;
  ga4PropertyId: string;
  reportingTimezone: string | null;
  status: "active" | "needs_reconnect" | "needs_remapping" | "superseded";
  lastValidatedAt: string | null;
}

interface MappingDoc {
  id: string | number;
  wordpressConnection: unknown;
  googleConnection: unknown;
  ga4PropertyId: string;
  reportingTimezone?: string | null;
  status: "active" | "needs_reconnect" | "needs_remapping" | "superseded";
  lastValidatedAt?: string | null;
}

function toMapping(doc: MappingDoc): AnalyticsMapping {
  return {
    mappingId: String(doc.id),
    wordpressConnectionId: String(doc.wordpressConnection),
    googleConnectionId: String(doc.googleConnection),
    ga4PropertyId: doc.ga4PropertyId,
    reportingTimezone: doc.reportingTimezone ?? null,
    status: doc.status,
    lastValidatedAt: doc.lastValidatedAt ?? null,
  };
}

export async function listMappingsForOrganisation(organisationId: string): Promise<AnalyticsMapping[]> {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "google-analytics-mappings",
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
): Promise<AnalyticsMapping | null> {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "google-analytics-mappings",
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
  ga4PropertyId: string;
  reportingTimezone?: string;
}

/**
 * Replacing a mapping is one transaction, and the order inside it matters: supersede
 * the previous active row first, then insert the new row as active. See "Mappings are
 * capability-specific" in GOOGLE_PERFORMANCE_PLAN.md.
 */
export async function createOrReplaceMapping(
  organisationId: string,
  input: CreateMappingInput,
  confirmedByUserId: string
): Promise<{ mappingId: string }> {
  const wordpressConnection = await getWordPressConnection(organisationId, input.wordpressConnectionId);
  if (!wordpressConnection) throw new Error("WordPress connection not found for this organisation.");

  const googleConnection = await getConnectionForCapability(organisationId, input.googleConnectionId, "google-analytics");
  if (!googleConnection) throw new Error("Google connection not found for this organisation/capability.");

  const payload = await getPayloadClient();
  return runInTransaction(async (req) => {
    const existing = await payload.find({
      collection: "google-analytics-mappings",
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
        collection: "google-analytics-mappings",
        id: previous.id,
        data: { status: "superseded", replacedAt: new Date().toISOString() },
        req,
        overrideAccess: true,
      });
    }

    const created = await payload.create({
      collection: "google-analytics-mappings",
      data: {
        organisation: Number(organisationId),
        wordpressConnection: Number(input.wordpressConnectionId),
        googleConnection: Number(input.googleConnectionId),
        ga4PropertyId: input.ga4PropertyId,
        reportingTimezone: input.reportingTimezone,
        confirmedBy: Number(confirmedByUserId),
        confirmedAt: new Date().toISOString(),
        status: "active",
      },
      req,
      overrideAccess: true,
    });

    if (previous) {
      await payload.update({
        collection: "google-analytics-mappings",
        id: previous.id,
        data: { replacedBy: created.id },
        req,
        overrideAccess: true,
      });
    }

    return { mappingId: String(created.id) };
  });
}
