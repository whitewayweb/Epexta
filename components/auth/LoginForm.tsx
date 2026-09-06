"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type AuthState } from "@/lib/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthState = { error: null };

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const signupHref = redirectTo ? `/signup?redirectTo=${encodeURIComponent(redirectTo)}` : "/signup";

  return (
    <div>
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="redirectTo" value={redirectTo ?? ""} />
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" name="email" required autoComplete="email" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="current-password"
          />
        </div>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Please wait…" : "Log in"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href={signupHref} className="font-medium text-foreground underline underline-offset-4">
          Sign up
        </Link>
      </p>
    </div>
  );
}
