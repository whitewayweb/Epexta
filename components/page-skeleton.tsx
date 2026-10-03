import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder for the title row every signed-in page opens with (`PageHeader`). */
function HeaderSkeleton() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-9 w-36" />
    </div>
  );
}

/** Route-level loading state: a header plus a table of rows, shown while the page's data loads. */
export function TablePageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading">
      <HeaderSkeleton />
      <div className="rounded-xl border bg-card">
        <div className="flex gap-4 border-b px-4 py-3">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-1/3" />
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
            <Skeleton className="size-8 shrink-0" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="ml-auto h-4 w-1/4" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Same idea for card-grid pages such as the dashboard. */
export function CardGridPageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading">
      <HeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cards }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
