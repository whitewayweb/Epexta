import { ActivityFeedSkeleton } from "@/components/dashboard/activity-feed";
import { StatsRowSkeleton } from "@/components/dashboard/stats-row";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <StatsRowSkeleton />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ActivityFeedSkeleton />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  );
}
