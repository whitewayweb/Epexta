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
