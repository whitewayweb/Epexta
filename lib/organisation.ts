import { findMember, memberUserId, toMemberInput, type MemberRow, type OrganisationRole } from "./members";
import { getPayloadClient } from "./payload";

export interface OrganisationMembership {
  organisationId: string;
  role: OrganisationRole;
}

/**
 * The organisation (if any) that this user belongs to, and their role in it.
 * Assumes a user belongs to at most one organisation - `limit: 1` returns whichever
 * matches first. Every admin/member check in modules/wordpress/actions.ts relies on
 * this being unambiguous, so multi-org membership can't be introduced here alone.
 */
export async function getUserOrganisation(userId: string): Promise<OrganisationMembership | null> {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "organisations",
    where: { "members.user": { equals: userId } },
    limit: 1,
    overrideAccess: true,
  });

  const doc = result.docs[0];
  if (!doc) return null;

  const member = findMember((doc.members ?? []) as MemberRow[], userId);
  if (!member) return null;

  return { organisationId: String(doc.id), role: member.role };
}

/**
 * Creates a new organisation with this user as its sole admin. If no name is given (or it's
 * blank), defaults to the local part of the user's email so every organisation gets a usable
 * display name regardless of which flow created it.
 */
export async function createOrganisationForUser(userId: string, name?: string): Promise<string> {
  const payload = await getPayloadClient();
  const trimmed = name?.trim();

  let resolvedName = trimmed;
  if (!resolvedName) {
    const user = await payload.findByID({ collection: "users", id: userId, overrideAccess: true });
    resolvedName = user.email.split("@")[0];
  }

  const doc = await payload.create({
    collection: "organisations",
    data: { name: resolvedName, members: [{ user: Number(userId), role: "admin" }] },
    overrideAccess: true,
  });
  return String(doc.id);
}

export interface PopulatedMember {
  userId: string;
  email: string;
  role: OrganisationRole;
}

export async function getOrganisationMembers(organisationId: string): Promise<PopulatedMember[]> {
  const payload = await getPayloadClient();
  const doc = await payload.findByID({
    collection: "organisations",
    id: organisationId,
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

export async function addOrganisationMember(
  organisationId: string,
  userId: string,
  role: OrganisationRole
): Promise<{ ok: boolean; error?: string }> {
  const payload = await getPayloadClient();
  const doc = await payload.findByID({ collection: "organisations", id: organisationId, overrideAccess: true });
  const members = (doc.members ?? []) as MemberRow[];

  if (findMember(members, userId)) {
    return { ok: false, error: "That person is already a member." };
  }

  await payload.update({
    collection: "organisations",
    id: organisationId,
    data: { members: [...members.map(toMemberInput), { user: Number(userId), role }] },
    overrideAccess: true,
  });
  return { ok: true };
}

export async function removeOrganisationMember(
  organisationId: string,
  userId: string
): Promise<{ ok: boolean; error?: string }> {
  const payload = await getPayloadClient();
  const doc = await payload.findByID({ collection: "organisations", id: organisationId, overrideAccess: true });
  const members = (doc.members ?? []) as MemberRow[];
  const remaining = members.filter((m) => memberUserId(m) !== userId);

  if (!remaining.some((m) => m.role === "admin")) {
    return { ok: false, error: "An organisation must always have at least one admin." };
  }

  await payload.update({
    collection: "organisations",
    id: organisationId,
    data: { members: remaining.map(toMemberInput) },
    overrideAccess: true,
  });
  return { ok: true };
}
