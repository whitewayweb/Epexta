import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { countActivity, type ActivityViewer } from "@/lib/activity";
import { listWordPressConnections } from "@/modules/wordpress/organisation";

function Stat({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={`text-2xl font-medium tabular-nums ${tone === "danger" && value > 0 ? "text-destructive" : ""}`}>
          {value}
        </span>
      </CardContent>
    </Card>
  );
}

/** Seven-day counts for the dashboard, scoped like the feed: admins see the whole organisation. */
export async function StatsRow({ organisationId, viewer }: { organisationId: string; viewer: ActivityViewer }) {
  const [sites, actions, calls, failures] = await Promise.all([
    listWordPressConnections(organisationId, viewer.userId).then((connections) => connections.length),
    countActivity(organisationId, viewer, { sinceDays: 7, kinds: ["create", "update"], outcome: "success" }),
    countActivity(organisationId, viewer, { sinceDays: 7 }),
    countActivity(organisationId, viewer, { sinceDays: 7, outcome: "failure" }),
  ]);

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Stat label="Sites connected" value={sites} />
      <Stat label="Posts created or updated (7 days)" value={actions} />
      <Stat label="Tool calls (7 days)" value={calls} />
      <Stat label="Failures (7 days)" value={failures} tone="danger" />
    </div>
  );
}

export function StatsRowSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" role="status" aria-label="Loading stats">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-[74px] rounded-xl" />
      ))}
    </div>
  );
}
