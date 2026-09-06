"use client";

import { useActionState } from "react";
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
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 420 }}>
      <label>
        WordPress site URL
        <input
          type="url"
          name="siteUrl"
          required
          defaultValue={siteUrl}
          placeholder="https://example.com"
          style={{ display: "block", width: "100%" }}
        />
      </label>
      <label>
        WordPress username
        <input type="text" name="username" required defaultValue={username} style={{ display: "block", width: "100%" }} />
      </label>
      <label>
        Application Password
        <input
          type="password"
          name="appPassword"
          required
          placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
          style={{ display: "block", width: "100%" }}
        />
      </label>
      <p style={{ fontSize: 12, color: "#666" }}>
        Generate one under WP Admin → Users → Profile → Application Passwords on your own site.
      </p>
      {state.error && <p style={{ color: "crimson" }}>{state.error}</p>}
      {state.success && <p style={{ color: "green" }}>Saved.</p>}
      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save connection"}
      </button>
    </form>
  );
}
