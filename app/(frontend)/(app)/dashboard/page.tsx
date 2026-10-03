import { ArrowRight, KeyRound, Plus, UserPlus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ActivityFeed, ActivityFeedSkeleton } from "@/components/dashboard/activity-feed";
import { StatsRow, StatsRowSkeleton } from "@/components/dashboard/stats-row";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getEnabledModules } from "@/lib/entitlements";
import { MODULES } from "@/lib/modules";
import { getUserOrganisation } from "@/lib/organisation";
import { requireUser } from "@/lib/session";

const DASHBOARD_PATH = "/dashboard";

export default async function DashboardPage() {
  const user = await requireUser(DASHBOARD_PATH);
  const organisation = await getUserOrganisation(user.id);
  const enabled = organisation ? await getEnabledModules(organisation.organisationId) : [];
  const modules = MODULES.filter((module) => enabled.includes(module.slug));
  const firstName = user.name?.split(" ")[0];
  const isAdmin = organisation?.role === "admin";
  const viewer = organisation ? { userId: user.id, role: organisation.role } : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        description={
          isAdmin
            ? "What your organisation's AI apps have been doing."
            : "What your AI apps have been doing."
        }
      />

      {organisation && viewer && (
        <Suspense fallback={<StatsRowSkeleton />}>
          <StatsRow organisationId={organisation.organisationId} viewer={viewer} />
        </Suspense>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {organisation && viewer ? (
          <Suspense fallback={<ActivityFeedSkeleton />}>
            <ActivityFeed organisationId={organisation.organisationId} viewer={viewer} />
          </Suspense>
        ) : (
          <Card>
            <CardContent className="text-sm text-muted-foreground">
              Add a WordPress site to create your organisation and start seeing activity here.
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col gap-6">
          {modules.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Modules</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                {modules.map((module) => (
                  <Button
                    key={module.slug}
                    variant="ghost"
                    className="justify-between"
                    render={<Link href={module.overviewPath} />}
                  >
                    {module.name}
                    <ArrowRight />
                  </Button>
                ))}
              </CardContent>
            </Card>
          )}

          {(isAdmin || !organisation) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quick actions</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Button variant="outline" className="justify-start" render={<Link href="/wordpress/connect" />}>
                  <Plus />
                  Add WordPress site
                </Button>
                {isAdmin && (
                  <Button variant="outline" className="justify-start" render={<Link href="/settings/members" />}>
                    <UserPlus />
                    Invite member
                  </Button>
                )}
                <Button variant="outline" className="justify-start" render={<Link href="/settings/api-key" />}>
                  <KeyRound />
                  Create API key
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
