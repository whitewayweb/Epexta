import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type React from "react";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/lib/auth-actions";
import { approveAuthorizationAction, denyAuthorizationAction } from "@/lib/oauth/actions";
import { oauthProvider } from "@/lib/oauth/provider";
import { getOrganisationName, getUserOrganisation } from "@/lib/organisation";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Connect an app · Epexta",
  robots: { index: false },
};

// OAuth consent screen - see OAUTH_CONNECTOR_PLAN.md "/oauth/authorize and the consent
// screen" and lib/oauth/authorize.ts for the validation order this page relies on.

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-medium text-foreground">{children}</dd>
    </div>
  );
}

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const start = await oauthProvider.startAuthorization(await searchParams);
  if (start.kind === "invalid") {
    return (
      <AuthCard title="Can't connect this app" description={start.message}>
        <Button variant="outline" className="w-full" render={<Link href="/" />}>
          Back to Epexta
        </Button>
      </AuthCard>
    );
  }
  if (start.kind === "redirect") redirect(start.url);

  const { consent } = start;
  const user = await requireUser(consent.authorizePath);

  const organisation = await getUserOrganisation(user.id);
  if (!organisation) {
    return (
      <AuthCard
        title="Finish setting up Epexta first"
        description={`${consent.clientName} needs an Epexta organisation with ${consent.resource.name} set up before it can connect.`}
      >
        <Button className="w-full" render={<Link href={consent.resource.modules[0].connectPath} />}>
          Set up {consent.resource.modules[0].name}
        </Button>
      </AuthCard>
    );
  }

  const organisationName = await getOrganisationName(organisation.organisationId);
  const hiddenQuery = <input type="hidden" name="query" value={consent.query} />;

  return (
    <AuthCard
      title={`Connect ${consent.clientName}`}
      description={`${consent.clientName} wants to use Epexta's ${consent.resource.name} tools on your behalf.`}
    >
      <div className="flex flex-col gap-5">
        <dl className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm">
          <Detail label="Account">{user.email}</Detail>
          <Detail label="Organisation">{organisationName ?? "Your organisation"}</Detail>
          <Detail label="App identity">{consent.publisherHost ? `Published by ${consent.publisherHost}` : "Self-registered"}</Detail>
          <Detail label="Returns you to">{consent.redirectHost}</Detail>
        </dl>

        {consent.runsLocally && (
          <Alert>
            <TriangleAlert />
            <AlertTitle>This app runs on your computer</AlertTitle>
            <AlertDescription>
              Only approve if you just started connecting Epexta from an app on this device, such as Claude Code.
            </AlertDescription>
          </Alert>
        )}

        <p className="text-sm text-muted-foreground">
          It will be able to use the same tools an API key can, limited to your organisation&apos;s plan. You can
          disconnect it at any time from Settings → Connected apps.
        </p>

        <div className="flex gap-2">
          <form action={denyAuthorizationAction} className="flex-1">
            {hiddenQuery}
            <Button type="submit" variant="outline" className="w-full">
              Deny
            </Button>
          </form>
          <form action={approveAuthorizationAction} className="flex-1">
            {hiddenQuery}
            <Button type="submit" className="w-full">
              Approve
            </Button>
          </form>
        </div>

        <form action={logoutAction} className="text-center text-sm text-muted-foreground">
          <input type="hidden" name="redirectTo" value={`/login?redirectTo=${encodeURIComponent(consent.authorizePath)}`} />
          Not {user.email}?{" "}
          <Button type="submit" variant="link" className="h-auto p-0 align-baseline">
            Switch account
          </Button>
        </form>
      </div>
    </AuthCard>
  );
}
