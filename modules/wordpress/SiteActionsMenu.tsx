"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { removeConnectionAction, type ConnectionState } from "./actions";

const initialState: ConnectionState = { error: null, success: false };

export function SiteActionsMenu({ connectionId, label }: { connectionId: string; label: string }) {
  const [state, formAction] = useActionState(removeConnectionAction, initialState);
  const [pending, startTransition] = useTransition();

  function remove() {
    if (!window.confirm(`Remove "${label}"? Epexta will no longer be able to publish to it.`)) return;
    const formData = new FormData();
    formData.set("connectionId", connectionId);
    startTransition(() => formAction(formData));
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${label}`} disabled={pending} />}
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem render={<Link href={`/wordpress/connect?edit=${connectionId}`} />}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={remove}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </div>
  );
}
