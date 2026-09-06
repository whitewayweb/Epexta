"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signupAction, type AuthState } from "@/lib/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthState = { error: null };

export function SignupForm({ redirectTo }: { redirectTo?: string }) {
  const [state, formAction, pending] = useActionState(signupAction, initialState);
  const loginHref = redirectTo ? `/login?redirectTo=${encodeURIComponent(redirectTo)}` : "/login";

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
            autoComplete="new-password"
          />
        </div>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Please wait…" : "Create account"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href={loginHref} className="font-medium text-foreground underline underline-offset-4">
          Log in
        </Link>
      </p>
    </div>
  );
}
