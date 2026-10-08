import { Progress } from "@/components/ui/progress";

/** One metered limit: what's used of what the plan includes, as a labelled bar. */
export function UsageMeter({ label, used, limit, hint }: { label: string; used: number; limit: number; hint?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {used.toLocaleString("en-US")} of {limit.toLocaleString("en-US")}
        </span>
      </div>
      <Progress value={limit > 0 ? Math.min(100, (used / limit) * 100) : 100} aria-label={label} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
