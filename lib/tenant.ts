import { findMember, memberUserId, type MemberRow, type TenantRole } from "./members";
import { getPayloadClient } from "./payload";

export interface TenantMembership {
  tenantId: string;
  role: TenantRole;
}

/** The tenant (if any) that this user belongs to, and their role in it. */
export async function getUserTenant(userId: string): Promise<TenantMembership | null> {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "tenants",
    where: { "members.user": { equals: userId } },
    limit: 1,
    overrideAccess: true,
  });

  const doc = result.docs[0];
  if (!doc) return null;

  const member = findMember((doc.members ?? []) as MemberRow[], userId);
  if (!member) return null;

  return { tenantId: String(doc.id), role: member.role };
}

/** Creates a new tenant with this user as its sole admin. */
export async function createTenantForUser(userId: string): Promise<string> {
  const payload = await getPayloadClient();
  const doc = await payload.create({
    collection: "tenants",
    data: { members: [{ user: userId, role: "admin" }] },
    overrideAccess: true,
  });
  return String(doc.id);
}

export interface PopulatedMember {
  userId: string;
  email: string;
  role: TenantRole;
}

export async function getTenantMembers(tenantId: string): Promise<PopulatedMember[]> {
  const payload = await getPayloadClient();
  const doc = await payload.findByID({
    collection: "tenants",
    id: tenantId,
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

export async function addTenantMember(
  tenantId: string,
  userId: string,
  role: TenantRole
): Promise<{ ok: boolean; error?: string }> {
  const payload = await getPayloadClient();
  const doc = await payload.findByID({ collection: "tenants", id: tenantId, overrideAccess: true });
  const members = (doc.members ?? []) as MemberRow[];

  if (findMember(members, userId)) {
    return { ok: false, error: "That person is already a member." };
  }

  await payload.update({
    collection: "tenants",
    id: tenantId,
    data: { members: [...members, { user: userId, role }] },
    overrideAccess: true,
  });
  return { ok: true };
}

export async function removeTenantMember(
  tenantId: string,
  userId: string
): Promise<{ ok: boolean; error?: string }> {
  const payload = await getPayloadClient();
  const doc = await payload.findByID({ collection: "tenants", id: tenantId, overrideAccess: true });
  const members = (doc.members ?? []) as MemberRow[];
  const remaining = members.filter((m) => memberUserId(m) !== userId);

  if (!remaining.some((m) => m.role === "admin")) {
    return { ok: false, error: "A tenant must always have at least one admin." };
  }

  await payload.update({
    collection: "tenants",
    id: tenantId,
    data: { members: remaining },
    overrideAccess: true,
  });
  return { ok: true };
}
