import type { PayloadRequest } from "payload";

export const ORGANISATION_ROLES = ["admin", "member"] as const;
export type OrganisationRole = (typeof ORGANISATION_ROLES)[number];

export interface MemberRow {
  user: string | { id: string | number; email?: string };
  role: OrganisationRole;
}

export function memberUserId(member: MemberRow): string {
  return typeof member.user === "object" ? String(member.user.id) : String(member.user);
}

export function findMember(members: MemberRow[] | null | undefined, userId: string): MemberRow | undefined {
  return members?.find((m) => memberUserId(m) === String(userId));
}

export function hasRole(members: MemberRow[] | null | undefined, userId: string, role: OrganisationRole): boolean {
  return findMember(members, userId)?.role === role;
}

/** Normalizes a (possibly populated) member row back to the plain shape Payload expects for writes. */
export function toMemberInput(member: MemberRow): { user: number; role: OrganisationRole } {
  return { user: Number(memberUserId(member)), role: member.role };
}

/** The platform owner — bypasses per-organisation membership checks in collection access control. */
export function isSuperadmin(req: PayloadRequest): boolean {
  return req.user?.role === "superadmin";
}
