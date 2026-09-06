"use client";

import { useActionState } from "react";
import { generateApiKeyAction, type ApiKeyState } from "./actions";

const initialState: ApiKeyState = { apiKey: null, error: null };

export function ApiKeyPanel() {
  const [state, formAction, pending] = useActionState(generateApiKeyAction, initialState);

  return (
    <div style={{ maxWidth: 420 }}>
      <p style={{ fontSize: 12, color: "#666" }}>
        Paste this key into ChatGPT&apos;s custom connector setup as the bearer token. Generating a new
        one invalidates the old one.
      </p>
      <form action={formAction}>
        {state.error && <p style={{ color: "crimson" }}>{state.error}</p>}
        <button type="submit" disabled={pending}>
          {pending ? "Generating…" : "Generate new API key"}
        </button>
      </form>
      {state.apiKey && (
        <div style={{ marginTop: 8 }}>
          <p style={{ color: "green" }}>Copy this now — it won&apos;t be shown again:</p>
          <code style={{ display: "block", padding: 8, background: "#f0f0f0", wordBreak: "break-all" }}>
            {state.apiKey}
          </code>
        </div>
      )}
    </div>
  );
}
