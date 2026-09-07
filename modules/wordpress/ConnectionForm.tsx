"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveConnectionAction, type ConnectionState } from "./actions";

const initialState: ConnectionState = { error: null, success: false };

export function ConnectionForm({
  siteUrl,
  username,
}: {
  siteUrl: string;
  username: string;
}) {
  const [state, formAction, pending] = useActionState(saveConnectionAction, initialState);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="siteUrl">WordPress site URL</Label>
        <Input id="siteUrl" type="url" name="siteUrl" required defaultValue={siteUrl} placeholder="https://example.com" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="username">WordPress username</Label>
        <Input id="username" type="text" name="username" required defaultValue={username} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="appPassword">Application Password</Label>
        <Input
          id="appPassword"
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
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save connection"}
      </Button>
    </form>
  );
}
