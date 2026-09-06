import { getPayloadClient } from "@/lib/payload";

export interface WordPressConnection {
  connectionId: string;
  siteUrl: string;
  username: string;
}

export async function getWordPressConnection(tenantId: string): Promise<WordPressConnection | null> {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "wordpress-connections",
    where: { tenant: { equals: tenantId } },
    limit: 1,
    overrideAccess: true,
  });

  const doc = result.docs[0];
  if (!doc) return null;

  return { connectionId: String(doc.id), siteUrl: String(doc.siteUrl), username: String(doc.username) };
}

export async function saveWordPressConnection(
  tenantId: string,
  data: { siteUrl: string; username: string; appPassword: string }
): Promise<void> {
  const payload = await getPayloadClient();
  const existing = await getWordPressConnection(tenantId);

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
      data: { ...data, tenant: tenantId },
      overrideAccess: true,
    });
  }
}
