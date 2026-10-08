import { z } from "zod";

/**
 * Shared by the signup/login forms (client-side, for inline errors) and the auth Server
 * Actions (the authoritative check). Kept out of `auth/actions.ts` because a "use server"
 * file may only export async functions. No server-only imports here.
 */
export const credentialsSchema = z.object({
  email: z.string().trim().min(1, "Email is required.").email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export const fullNameSchema = z
  .string()
  .trim()
  .min(1, "Full name is required.")
  .max(120, "Full name must be 120 characters or fewer.");

export const signupSchema = credentialsSchema.extend({ name: fullNameSchema });

export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}
