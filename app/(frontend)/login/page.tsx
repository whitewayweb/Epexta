import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/LoginForm";
import { safeRedirectPath } from "@/lib/redirects";
import { getCurrentUser } from "@/lib/session";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo } = await searchParams;
  const user = await getCurrentUser();
  if (user) {
    redirect(safeRedirectPath(redirectTo));
  }

  return (
    <AuthCard title="Log in" description="Welcome back. Enter your details to continue.">
      <LoginForm redirectTo={redirectTo} />
    </AuthCard>
  );
}
