"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PublicConnection } from "@/modules/google-connections";
import type { DisplayConnection } from "@/modules/wordpress/organisation";
import { saveMappingAction, type MappingState } from "./actions";

const initialState: MappingState = { error: null, success: false };

interface MappingFormProps {
  wordpressConnections: DisplayConnection[];
  googleConnections: PublicConnection[];
}

export function MappingForm({ wordpressConnections, googleConnections }: MappingFormProps) {
  const [state, formAction, pending] = useActionState(saveMappingAction, initialState);
  const activeGoogleConnections = googleConnections.filter((c) => c.status === "active");

  if (wordpressConnections.length === 0) {
    return <p className="text-sm text-muted-foreground">Connect a WordPress site first, then map it to a Search Console property here.</p>;
  }
  if (activeGoogleConnections.length === 0) {
    return <p className="text-sm text-muted-foreground">Connect an active Google account above before mapping a property.</p>;
  }

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="wordpressConnectionId">WordPress site</Label>
        <Select name="wordpressConnectionId">
          <SelectTrigger id="wordpressConnectionId">
            <SelectValue placeholder="Select a site" />
          </SelectTrigger>
          <SelectContent>
            {wordpressConnections.map((c) => (
              <SelectItem key={c.connectionId} value={c.connectionId}>
                {c.label || c.siteUrl}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="googleConnectionId">Google account</Label>
        <Select name="googleConnectionId">
          <SelectTrigger id="googleConnectionId">
            <SelectValue placeholder="Select a Google account" />
          </SelectTrigger>
          <SelectContent>
            {activeGoogleConnections.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.googleAccountLabel}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="searchConsolePropertyUrl">Search Console property</Label>
        <Input
          id="searchConsolePropertyUrl"
          type="text"
          name="searchConsolePropertyUrl"
          required
          placeholder="sc-domain:example.com"
        />
        <p className="text-xs text-muted-foreground">
          Either a domain property (sc-domain:example.com) or a URL-prefix property, exactly as it appears in Search Console.
        </p>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p className="text-sm text-emerald-600 dark:text-emerald-400">Saved.</p>}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save mapping"}
      </Button>
    </form>
  );
}
