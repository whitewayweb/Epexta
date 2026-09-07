"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addConnectionAction, updateConnectionAction, type ConnectionState } from "./actions";

const initialState: ConnectionState = { error: null, success: false };

interface ConnectionFormProps {
  mode: "add" | "edit";
  connectionId?: string;
  label?: string;
  siteUrl?: string;
  username?: string;
  onCancel?: () => void;
}

export function ConnectionForm({
  mode,
  connectionId,
  label = "",
  siteUrl = "",
  username = "",
  onCancel,
}: ConnectionFormProps) {
  const action = mode === "edit" ? updateConnectionAction : addConnectionAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      {connectionId && <input type="hidden" name="connectionId" value={connectionId} />}
      <div className="grid gap-1.5">
        <Label htmlFor={`label-${connectionId ?? "new"}`}>Site label (optional)</Label>
        <Input
          id={`label-${connectionId ?? "new"}`}
          type="text"
          name="label"
          defaultValue={label}
          placeholder="e.g. Main blog"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`siteUrl-${connectionId ?? "new"}`}>WordPress site URL</Label>
        <Input
          id={`siteUrl-${connectionId ?? "new"}`}
          type="url"
          name="siteUrl"
          required
          defaultValue={siteUrl}
          placeholder="https://example.com"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`username-${connectionId ?? "new"}`}>WordPress username</Label>
        <Input
          id={`username-${connectionId ?? "new"}`}
          type="text"
          name="username"
          required
          defaultValue={username}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`appPassword-${connectionId ?? "new"}`}>Application Password</Label>
        <Input
          id={`appPassword-${connectionId ?? "new"}`}
          type="password"
          name="appPassword"
          required
          placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
        />
        <p className="text-xs text-muted-foreground">
          Generate one under WP Admin → Users → Profile → Application Passwords on your own site.
        </p>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p className="text-sm text-emerald-600 dark:text-emerald-400">Saved.</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Saving…" : mode === "edit" ? "Save changes" : "Add site"}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="self-start">
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
