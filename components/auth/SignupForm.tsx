"use client";

import Link from "next/link";
import { useActionState, useState, type FormEvent } from "react";
import { signupAction, type AuthState } from "@/lib/auth-actions";
import { signupSchema } from "@/lib/auth-schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthState = { error: null };

export function SignupForm({ redirectTo }: { redirectTo?: string }) {
  const [state, formAction, pending] = useActionState(signupAction, initialState);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const loginHref = redirectTo ? `/login?redirectTo=${encodeURIComponent(redirectTo)}` : "/login";

  // Same schema the Server Action enforces; this only surfaces the errors inline first.
  function validate(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const parsed = signupSchema.safeParse({
      name: data.get("name") ?? "",
      email: data.get("email"),
      password: data.get("password"),
    });
    if (parsed.success) {
      setFieldErrors({});
      return;
    }
    event.preventDefault();
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      errors[key] ??= issue.message;
    }
    setFieldErrors(errors);
  }

  return (
    <div>
      <form action={formAction} onSubmit={validate} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="redirectTo" value={redirectTo ?? ""} />
        <div className="grid gap-2">
          <Label htmlFor="name">Full name</Label>
          <Input
            id="name"
            type="text"
            name="name"
            required
            maxLength={120}
            autoComplete="name"
            aria-invalid={!!fieldErrors.name}
          />
          {fieldErrors.name && <p className="text-sm text-destructive">{fieldErrors.name}</p>}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" name="email" required autoComplete="email" aria-invalid={!!fieldErrors.email} />
          {fieldErrors.email && <p className="text-sm text-destructive">{fieldErrors.email}</p>}
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
            aria-invalid={!!fieldErrors.password}
          />
          {fieldErrors.password && <p className="text-sm text-destructive">{fieldErrors.password}</p>}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="organisationName">
            Organisation name <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="organisationName"
            type="text"
            name="organisationName"
            autoComplete="organization"
            placeholder="e.g. Acme Health (leave blank to use your name)"
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
