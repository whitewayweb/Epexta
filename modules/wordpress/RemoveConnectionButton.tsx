"use client";

import { Trash2 } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { removeConnectionAction, type ConnectionState } from "./actions";

const initialState: ConnectionState = { error: null, success: false };

export function RemoveConnectionButton({
  connectionId,
  variant = "text",
}: {
  connectionId: string;
  variant?: "text" | "icon";
}) {
  const [state, formAction, pending] = useActionState(removeConnectionAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="connectionId" value={connectionId} />
      {variant === "icon" ? (
        <Button
          type="submit"
          variant="ghost"
          size="icon-sm"
          disabled={pending}
          aria-label="Remove connection"
        >
          <Trash2 />
        </Button>
      ) : (
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "Removing…" : "Remove"}
        </Button>
      )}
      {state.error && <p className="mt-1 text-xs text-destructive">{state.error}</p>}
    </form>
  );
}
