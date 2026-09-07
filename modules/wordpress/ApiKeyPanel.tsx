"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { generateApiKeyAction, type ApiKeyState } from "./actions";

const initialState: ApiKeyState = { apiKey: null, error: null };

export function ApiKeyPanel() {
  const [state, formAction, pending] = useActionState(generateApiKeyAction, initialState);

  return (
    <div className="max-w-md">
      <p className="text-xs text-muted-foreground">
        Paste this key into ChatGPT&apos;s custom connector setup as the bearer token. Generating a new one
        invalidates the old one.
      </p>
      <form action={formAction} className="mt-3">
        {state.error && <p className="mb-2 text-sm text-destructive">{state.error}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Generating…" : "Generate new API key"}
        </Button>
      </form>
      {state.apiKey && (
        <div className="mt-3 space-y-1.5">
          <p className="text-sm text-emerald-600 dark:text-emerald-400">Copy this now, it won&apos;t be shown again:</p>
          <code className="block break-all rounded-md bg-muted px-3 py-2 font-mono text-sm text-foreground">
            {state.apiKey}
          </code>
        </div>
      )}
    </div>
  );
}
