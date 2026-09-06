"use client";

import { useActionState, useState } from "react";
import {
  loginAction,
  signupAction,
  signupAndConnectAction,
  type AuthState,
  type ConnectionState,
} from "./actions";

const loginInitialState: AuthState = { error: null };
const signupInitialState: AuthState = { error: null };
const signupConnectInitialState: ConnectionState = { error: null, success: false };

export function AuthForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [invitedOnly, setInvitedOnly] = useState(false);

  const [loginState, loginFormAction, loginPending] = useActionState(loginAction, loginInitialState);
  const [signupState, signupFormAction, signupPending] = useActionState(signupAction, signupInitialState);
  const [connectState, signupConnectFormAction, connectPending] = useActionState(
    signupAndConnectAction,
    signupConnectInitialState
  );

  return (
    <div style={{ maxWidth: 420 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button type="button" onClick={() => setMode("login")} disabled={mode === "login"}>
          Log in
        </button>
        <button type="button" onClick={() => setMode("signup")} disabled={mode === "signup"}>
          Sign up
        </button>
      </div>

      {mode === "login" && (
        <form action={loginFormAction} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
          {loginState.error && <p style={{ color: "crimson" }}>{loginState.error}</p>}
          <button type="submit" disabled={loginPending}>
            {loginPending ? "Please wait…" : "Log in"}
          </button>
        </form>
      )}

      {mode === "signup" && (
        <>
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, fontSize: 13 }}>
            <input type="checkbox" checked={invitedOnly} onChange={(e) => setInvitedOnly(e.target.checked)} />
            I was invited to an existing organisation
          </label>

          {invitedOnly ? (
            <form action={signupFormAction} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <p style={{ fontSize: 12, color: "#666" }}>
                Create your account, then ask your organisation admin to add you as a member.
              </p>
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
              {signupState.error && <p style={{ color: "crimson" }}>{signupState.error}</p>}
              <button type="submit" disabled={signupPending}>
                {signupPending ? "Please wait…" : "Create account"}
              </button>
            </form>
          ) : (
            <form action={signupConnectFormAction} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <p style={{ fontSize: 12, color: "#666" }}>
                Create your account, name your organisation, and connect your WordPress site in one step.
              </p>
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
              <label>
                Organisation name
                <input type="text" name="orgName" required style={{ display: "block", width: "100%" }} />
              </label>
              <label>
                WordPress site URL
                <input
                  type="url"
                  name="siteUrl"
                  required
                  placeholder="https://example.com"
                  style={{ display: "block", width: "100%" }}
                />
              </label>
              <label>
                WordPress username
                <input type="text" name="username" required style={{ display: "block", width: "100%" }} />
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
              {connectState.error && <p style={{ color: "crimson" }}>{connectState.error}</p>}
              <button type="submit" disabled={connectPending}>
                {connectPending ? "Please wait…" : "Create account & connect"}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
