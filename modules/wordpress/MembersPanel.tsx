"use client";

import { UserPlus } from "lucide-react";
import type { PopulatedMember } from "@/lib/organisation";
import { useActionState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { inviteMemberAction, removeMemberAction, type MemberActionState } from "./actions";

const initialState: MemberActionState = { error: null, success: false };

export function MembersPanel({ members, currentUserId }: { members: PopulatedMember[]; currentUserId: string }) {
  const [inviteState, inviteFormAction, invitePending] = useActionState(inviteMemberAction, initialState);
  const [removeState, removeFormAction, removePending] = useActionState(removeMemberAction, initialState);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Invite a member</CardTitle>
          <CardDescription>
            They need an Epexta account already. Members can use your organisation&apos;s connections from their AI apps
            but can&apos;t change them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={inviteFormAction} className="flex flex-col gap-2 sm:flex-row">
            <Label htmlFor="invite-email" className="sr-only">
              Email address
            </Label>
            <Input id="invite-email" type="email" name="email" placeholder="teammate@example.com" required className="sm:max-w-sm" />
            <Button type="submit" disabled={invitePending}>
              <UserPlus />
              {invitePending ? "Inviting…" : "Invite"}
            </Button>
          </form>
          {inviteState.error && <p className="mt-2 text-sm text-destructive">{inviteState.error}</p>}
          {inviteState.success && <p className="mt-2 text-sm text-success">Invited.</p>}
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="pl-4">Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="w-px pr-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.userId}>
                <TableCell className="pl-4">
                  <span className="flex items-center gap-3">
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                        {member.email.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{member.email}</span>
                    {member.userId === currentUserId && <Badge variant="secondary">You</Badge>}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={member.role === "admin" ? "outline" : "secondary"}>
                    {member.role === "admin" ? "Admin" : "Member"}
                  </Badge>
                </TableCell>
                <TableCell className="pr-4 text-right">
                  {member.role !== "admin" && (
                    <form action={removeFormAction}>
                      <input type="hidden" name="userId" value={member.userId} />
                      <Button type="submit" variant="ghost" size="sm" disabled={removePending} className="text-muted-foreground hover:text-destructive">
                        Remove
                      </Button>
                    </form>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {removeState.error && <p className="border-t px-4 py-3 text-sm text-destructive">{removeState.error}</p>}
      </Card>
    </div>
  );
}
