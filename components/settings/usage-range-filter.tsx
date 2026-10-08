import Link from "next/link";
import { Button } from "@/components/ui/button";
import { USAGE_RANGES, type UsageRange } from "@/lib/plans/usage-ranges";

const LABELS: Record<UsageRange, string> = { "7d": "7d", "30d": "30d", "90d": "90d", all: "All" };

/** The range switcher: plain links, so a filtered view is shareable and the page stays server-rendered. */
export function UsageRangeFilter({ current, basePath }: { current: UsageRange; basePath: string }) {
  return (
    <nav aria-label="Usage range" className="flex items-center gap-1">
      {(Object.keys(USAGE_RANGES) as UsageRange[]).map((range) => (
        <Button
          key={range}
          size="sm"
          variant={range === current ? "secondary" : "ghost"}
          aria-current={range === current ? "page" : undefined}
          render={<Link href={`${basePath}?range=${range}`} scroll={false} />}
        >
          {LABELS[range]}
        </Button>
      ))}
    </nav>
  );
}
