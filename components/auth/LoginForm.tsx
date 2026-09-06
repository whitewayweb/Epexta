"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type AuthState } from "@/lib/auth-actions";

const initialState: AuthState = { error: null };

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const signupHref = redirectTo ? `/signup?redirectTo=${encodeURIComponent(redirectTo)}` : "/signup";

  return (
    <div style={{ maxWidth: 420 }}>
      <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <input type="hidden" name="redirectTo" value={redirectTo ?? ""} />
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
            autoComplete="current-password"
            style={{ display: "block", width: "100%" }}
          />
        </label>
        {state.error && <p style={{ color: "crimson" }}>{state.error}</p>}
        <button type="submit" disabled={pending}>
          {pending ? "Please wait…" : "Log in"}
        </button>
      </form>
      <p style={{ fontSize: 13, marginTop: 12 }}>
        Don&apos;t have an account? <Link href={signupHref}>Sign up</Link>
      </p>
    </div>
  );
}
