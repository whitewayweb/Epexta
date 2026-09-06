"use client";

import { useActionState, useState } from "react";
import { loginAction, signupAction, type AuthState } from "./actions";

const initialState: AuthState = { error: null };

export function AuthForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const action = mode === "login" ? loginAction : signupAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <div style={{ maxWidth: 360 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button type="button" onClick={() => setMode("login")} disabled={mode === "login"}>
          Log in
        </button>
        <button type="button" onClick={() => setMode("signup")} disabled={mode === "signup"}>
          Sign up
        </button>
      </div>
      <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label>
          Email
          <input type="email" name="email" required autoComplete="email" style={{ display: "block", width: "100%" }} />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            style={{ display: "block", width: "100%" }}
          />
        </label>
        {state.error && <p style={{ color: "crimson" }}>{state.error}</p>}
        <button type="submit" disabled={pending}>
          {pending ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
        </button>
      </form>
    </div>
  );
}
