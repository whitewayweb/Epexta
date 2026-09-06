"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signupAction, type AuthState } from "@/lib/auth-actions";

const initialState: AuthState = { error: null };

export function SignupForm({ redirectTo }: { redirectTo?: string }) {
  const [state, formAction, pending] = useActionState(signupAction, initialState);
  const loginHref = redirectTo ? `/login?redirectTo=${encodeURIComponent(redirectTo)}` : "/login";

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
            autoComplete="new-password"
            style={{ display: "block", width: "100%" }}
          />
        </label>
        {state.error && <p style={{ color: "crimson" }}>{state.error}</p>}
        <button type="submit" disabled={pending}>
          {pending ? "Please wait…" : "Create account"}
        </button>
      </form>
      <p style={{ fontSize: 13, marginTop: 12 }}>
        Already have an account? <Link href={loginHref}>Log in</Link>
      </p>
    </div>
  );
}
