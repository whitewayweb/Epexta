import { findMember, memberUserId, type MemberRow, type TenantRole } from "@/lib/members";
import { getPayloadClient } from "@/lib/payload";

export interface TenantContext {
  connectionId: string;
  role: TenantRole;
  siteUrl: string;
  username: string;
  /** Raw (unpopulated) member rows, as stored — pass straight back into an update. */
  members: MemberRow[];
}

export async function getTenantContext(userId: string): Promise<TenantContext | null> {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "connections",
    where: { "members.user": { equals: userId } },
    limit: 1,
    overrideAccess: true,
  });

  const doc = result.docs[0];
  if (!doc) return null;

  const members = (doc.members ?? []) as MemberRow[];
  const own = findMember(members, userId);
  if (!own) return null;

  return {
    connectionId: String(doc.id),
    role: own.role,
    siteUrl: String(doc.siteUrl),
    username: String(doc.username),
    members,
  };
}

export interface PopulatedMember {
  userId: string;
  email: string;
  role: TenantRole;
}

export async function getPopulatedMembers(connectionId: string): Promise<PopulatedMember[]> {
  const payload = await getPayloadClient();
  const doc = await payload.findByID({
    collection: "connections",
    id: connectionId,
    depth: 1,
    overrideAccess: true,
  });

  const members = (doc.members ?? []) as MemberRow[];
  return members.map((m) => ({
    userId: memberUserId(m),
    email: typeof m.user === "object" ? String(m.user.email ?? "") : "(unknown)",
    role: m.role,
  }));
}
