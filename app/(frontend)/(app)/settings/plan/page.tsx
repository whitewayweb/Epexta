import { PageHeader } from "@/components/page-header";
import { UsageMeter } from "@/components/settings/plan-usage";
import { UsageChart } from "@/components/settings/usage-chart";
import { UsageRangeFilter } from "@/components/settings/usage-range-filter";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { getUserOrganisation } from "@/lib/organisation";
import { requireUser } from "@/lib/auth/session";
import { getToolCallsToday } from "@/lib/plans/usage";
import { parseUsageRange, type UsageRange } from "@/lib/plans/usage-ranges";
import { getUsageHistory } from "@/lib/plans/usage-rollup";
import { getSiteLimitState } from "@/modules/wordpress/organisation";

const PLAN_PATH = "/settings/plan";

const RANGE_TITLES: Record<UsageRange, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

export default async function PlanSettingsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const range = parseUsageRange((await searchParams).range);
  const user = await requireUser(PLAN_PATH);
  const organisation = await getUserOrganisation(user.id);

  if (!organisation) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader title="Plan & usage" />
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>You&apos;re not in an organisation yet</EmptyTitle>
            <EmptyDescription>Add a WordPress site to create your organisation.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const [{ plan, used: sitesUsed, reached: siteLimitReached }, toolCalls, history] = await Promise.all([
    getSiteLimitState(organisation.organisationId),
    getToolCallsToday(organisation.organisationId),
    getUsageHistory(organisation.organisationId, range),
  ]);

  const atLimit = siteLimitReached || toolCalls >= plan.dailyToolCalls;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title="Plan & usage" description="What your organisation's plan includes, and how much of it you're using." />
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle>{plan.name} plan</CardTitle>
            <StatusBadge tone={atLimit ? "warning" : "success"}>
              {atLimit ? "At a limit" : "Within limits"}
            </StatusBadge>
          </div>
          <CardDescription>Limits apply to the whole organisation. Plan changes are handled by Epexta for now.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <UsageMeter
            label="Connected WordPress sites"
            used={sitesUsed}
            limit={plan.maxSites}
            hint="Sites already connected are never removed if your plan changes."
          />
          <UsageMeter label="Tool calls today" used={toolCalls} limit={plan.dailyToolCalls} hint="Resets at 00:00 UTC." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>{RANGE_TITLES[range]}</CardTitle>
            <UsageRangeFilter current={range} basePath={PLAN_PATH} />
          </div>
          <CardDescription>
            {history.calls.toLocaleString("en-US")} tool {history.calls === 1 ? "call" : "calls"}
            {history.failures > 0 && `, ${history.failures.toLocaleString("en-US")} failed`}, up to yesterday.
          </CardDescription>
        </CardHeader>
        {history.calls > 0 && (
          <CardContent className="flex flex-col gap-6">
            <UsageChart days={history.days} />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tool</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.tools.slice(0, 10).map((tool) => (
                  <TableRow key={`${tool.module}:${tool.tool}`}>
                    <TableCell className="font-mono text-xs">{tool.tool}</TableCell>
                    <TableCell className="text-right tabular-nums">{tool.calls.toLocaleString("en-US")}</TableCell>
                    <TableCell className="text-right tabular-nums">{tool.failures.toLocaleString("en-US")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
