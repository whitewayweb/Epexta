import { ArrowRight, Boxes } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        description="Pick up where you left off in your connected modules."
      />

      {modules.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Boxes />
            </EmptyMedia>
            <EmptyTitle>No modules available</EmptyTitle>
            <EmptyDescription>No modules are enabled for your organisation yet.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map((module) => (
            <Link key={module.slug} href={module.overviewPath} className="group">
              <Card className="h-full transition-colors group-hover:bg-muted/50">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2 text-base">
                    {module.name}
                    <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </CardTitle>
                  <CardDescription>{module.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
