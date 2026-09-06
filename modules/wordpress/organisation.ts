import { getPayloadClient } from "@/lib/payload";

export interface WordPressConnection {
  connectionId: string;
  siteUrl: string;
  username: string;
  appPassword: string;
}

export async function getWordPressConnection(organisationId: string): Promise<WordPressConnection | null> {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "wordpress-connections",
    where: { organisation: { equals: Number(organisationId) } },
    limit: 1,
    overrideAccess: true,
  });

  const doc = result.docs[0];
  if (!doc) return null;

  return {
    connectionId: String(doc.id),
    siteUrl: String(doc.siteUrl),
    username: String(doc.username),
    appPassword: String(doc.appPassword),
  };
}

export async function saveWordPressConnection(
  organisationId: string,
  data: { siteUrl: string; username: string; appPassword: string }
): Promise<void> {
  const payload = await getPayloadClient();
  const existing = await getWordPressConnection(organisationId);

  if (existing) {
    await payload.update({
      collection: "wordpress-connections",
      id: existing.connectionId,
      data,
      overrideAccess: true,
    });
  } else {
    await payload.create({
      collection: "wordpress-connections",
      data: { ...data, organisation: Number(organisationId) },
      overrideAccess: true,
    });
  }
}
