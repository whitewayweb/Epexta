import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { SignupForm } from "@/components/auth/SignupForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-6 py-16">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <Link href="/" className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-xs text-primary-foreground">
              E
            </span>
            Epexta
          </Link>
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>
            Create your account first. Afterwards you can connect your own WordPress site, or ask an
            organisation admin to add you as a member.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignupForm redirectTo={redirectTo} />
        </CardContent>
      </Card>
    </main>
  );
}
