import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { SignupForm } from "@/components/auth/SignupForm";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo } = await searchParams;
  const user = await getCurrentUser();
  if (user) {
    redirect(redirectTo && redirectTo.startsWith("/") ? redirectTo : "/");
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Create your account</h1>
      <p>
        Create your account first. Afterwards you can connect your own WordPress site, or ask an organisation
        admin to add you as a member.
      </p>
      <SignupForm redirectTo={redirectTo} />
    </main>
  );
}
