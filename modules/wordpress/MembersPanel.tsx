"use client";

import type { PopulatedMember } from "@/lib/organisation";
import { useActionState } from "react";
import { inviteMemberAction, removeMemberAction, type MemberActionState } from "./actions";

const initialState: MemberActionState = { error: null, success: false };

export function MembersPanel({ members }: { members: PopulatedMember[] }) {
  const [inviteState, inviteFormAction, invitePending] = useActionState(inviteMemberAction, initialState);
  const [removeState, removeFormAction, removePending] = useActionState(removeMemberAction, initialState);

  return (
    <div style={{ maxWidth: 480 }}>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {members.map((member) => (
          <li
            key={member.userId}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}
          >
            <span>
              {member.email} — {member.role}
            </span>
            {member.role !== "admin" && (
              <form action={removeFormAction}>
                <input type="hidden" name="userId" value={member.userId} />
                <button type="submit" disabled={removePending}>
                  Remove
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {removeState.error && <p style={{ color: "crimson" }}>{removeState.error}</p>}

      <form action={inviteFormAction} style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input type="email" name="email" placeholder="teammate@example.com" required />
        <button type="submit" disabled={invitePending}>
          {invitePending ? "Inviting…" : "Invite member"}
        </button>
      </form>
      {inviteState.error && <p style={{ color: "crimson" }}>{inviteState.error}</p>}
      {inviteState.success && <p style={{ color: "green" }}>Invited.</p>}
      <p style={{ fontSize: 12, color: "#666" }}>
        The invited person must already have an account (sign up at /connect first) — they&apos;ll only be
        able to use the ChatGPT tools against this site, not edit the connection.
      </p>
    </div>
  );
}
