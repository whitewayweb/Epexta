"use client";

import type { PopulatedMember } from "@/lib/organisation";
import { useActionState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inviteMemberAction, removeMemberAction, type MemberActionState } from "./actions";

const initialState: MemberActionState = { error: null, success: false };

export function MembersPanel({ members }: { members: PopulatedMember[] }) {
  const [inviteState, inviteFormAction, invitePending] = useActionState(inviteMemberAction, initialState);
  const [removeState, removeFormAction, removePending] = useActionState(removeMemberAction, initialState);

  return (
    <div className="max-w-md">
      <ul className="divide-y divide-border/60">
        {members.map((member) => (
          <li key={member.userId} className="flex items-center justify-between gap-3 py-2.5">
            <span className="flex items-center gap-2 text-sm">
              {member.email}
              <Badge variant="secondary">{member.role}</Badge>
            </span>
            {member.role !== "admin" && (
              <form action={removeFormAction}>
                <input type="hidden" name="userId" value={member.userId} />
                <Button type="submit" variant="outline" size="sm" disabled={removePending}>
                  Remove
                </Button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {removeState.error && <p className="mt-2 text-sm text-destructive">{removeState.error}</p>}

      <form action={inviteFormAction} className="mt-4 flex gap-2">
        <Input type="email" name="email" placeholder="teammate@example.com" required />
        <Button type="submit" disabled={invitePending}>
          {invitePending ? "Inviting…" : "Invite member"}
        </Button>
      </form>
      {inviteState.error && <p className="mt-2 text-sm text-destructive">{inviteState.error}</p>}
      {inviteState.success && <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">Invited.</p>}
      <p className="mt-2 text-xs text-muted-foreground">
        The invited person must already have an account (sign up at /connect first). They&apos;ll only be able to
        use the ChatGPT tools against this site, not edit the connection.
      </p>
    </div>
  );
}
