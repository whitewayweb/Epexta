import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/lib/auth-actions";
import { requireUser } from "@/lib/session";
import { continueToLinkedInAction } from "@/modules/linkedin/actions";
import { parseReturnUrl } from "@/modules/linkedin/oauth";

export const metadata: Metadata = {
  title: "Connect LinkedIn · Epexta",
  robots: { index: false },
};

// Consent step of the LinkedIn broker for the WP Social Publisher plugin - see
// modules/linkedin/oauth.ts. The user must see which site will receive the LinkedIn
// access; without this step a crafted link could deliver a token to any site.
export default async function LinkedInConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string }>;
}) {
  const { return: rawReturn } = await searchParams;
  const returnUrl = parseReturnUrl(rawReturn);

  if (!returnUrl) {
    return (
      <AuthCard title="Can't connect LinkedIn" description="Start again from the LinkedIn settings in WP Social Publisher on your WordPress site.">
        <Button variant="outline" className="w-full" render={<Link href="/" />}>
          Back to Epexta
        </Button>
      </AuthCard>
    );
  }

  const path = `/linkedin/connect?return=${encodeURIComponent(returnUrl.toString())}`;
  const user = await requireUser(path);

  return (
    <AuthCard
      title="Connect LinkedIn"
      description={`Let ${returnUrl.host} share posts to your LinkedIn profile and pages.`}
    >
      <div className="flex flex-col gap-5">
        <dl className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Epexta account</dt>
            <dd className="truncate text-right font-medium">{user.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Website</dt>
            <dd className="truncate text-right font-medium">{returnUrl.host}</dd>
          </div>
        </dl>

        <p className="flex gap-2 text-sm text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          Only continue if you started this from your own website. That site will be able to post to LinkedIn as you until
          the connection expires or you disconnect it.
        </p>

        <form action={continueToLinkedInAction}>
          <input type="hidden" name="return" value={returnUrl.toString()} />
          <Button type="submit" className="w-full">
            Continue to LinkedIn
          </Button>
        </form>

        <form action={logoutAction} className="text-center text-sm text-muted-foreground">
          <input type="hidden" name="redirectTo" value={`/login?redirectTo=${encodeURIComponent(path)}`} />
          Not {user.email}?{" "}
          <Button type="submit" variant="link" className="h-auto p-0 align-baseline">
            Switch account
          </Button>
        </form>
      </div>
    </AuthCard>
  );
}
