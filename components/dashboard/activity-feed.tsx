import { AlertTriangle, FilePlus2, Pencil, ScanSearch, type LucideIcon } from "lucide-react";
import { RelativeTime } from "@/components/relative-time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { listActivity, type ActivityItem, type ActivityViewer } from "@/lib/activity";

const KIND_ICONS: Record<ActivityItem["kind"], LucideIcon> = {
  create: FilePlus2,
  update: Pencil,
  read: ScanSearch,
};

function ActivityRow({ item }: { item: ActivityItem }) {
  const failed = item.outcome === "failure";
  const Icon = failed ? AlertTriangle : KIND_ICONS[item.kind];
  const where = [item.client ?? (item.source === "api-key" ? "API key" : null), item.siteLabel, item.actorLabel]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex items-start gap-3 border-t px-6 py-3 first:border-t-0">
      <span
        className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${
          failed ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"
        }`}
      >
        <Icon className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-sm leading-5 break-words">{item.summary}</p>
        {where && <p className="truncate text-xs text-muted-foreground">{where}</p>}
      </div>
      <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
        <RelativeTime iso={item.createdAt} />
      </span>
    </li>
  );
}

/** The latest writes and failures for the organisation (members see only their own). */
export async function ActivityFeed({ organisationId, viewer }: { organisationId: string; viewer: ActivityViewer }) {
  const items = await listActivity(organisationId, viewer, { limit: 8, hideSuccessfulReads: true });

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle className="text-base">Recent activity</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {items.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ScanSearch />
              </EmptyMedia>
              <EmptyTitle>No activity yet</EmptyTitle>
              <EmptyDescription>
                Posts your AI apps create or update, and anything that fails, will show up here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul>
            {items.map((item) => (
              <ActivityRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function ActivityFeedSkeleton() {
  return (
    <Card className="gap-0 py-0" role="status" aria-label="Loading recent activity">
      <CardHeader className="border-b py-4">
        <Skeleton className="h-5 w-36" />
      </CardHeader>
      <CardContent className="px-0">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-start gap-3 border-t px-6 py-3 first:border-t-0">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-3 w-14" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
