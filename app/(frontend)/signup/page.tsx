import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/SignupForm";
import { safeRedirectPath } from "@/lib/redirects";
import { getCurrentUser } from "@/lib/session";

export default async function SignupPage({
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
    <AuthCard
      title="Create your account"
      description={
        <>
          Create your account first. Afterwards you can connect your own WordPress site, or ask an organisation
          admin to add you as a member.
        </>
      }
    >
      <SignupForm redirectTo={redirectTo} />
    </AuthCard>
  );
}
