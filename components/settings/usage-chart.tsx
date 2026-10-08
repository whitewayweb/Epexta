interface DayUsage {
  day: string;
  calls: number;
  failures: number;
}

const HEIGHT = 100;
const compact = new Intl.NumberFormat("en-US", { notation: "compact" });
const dateLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * Tool calls per day as a bar chart, failures stacked on top in the destructive colour.
 * Server-rendered SVG on theme tokens: nothing to hydrate, and one bar per day stays legible
 * from a week up to the whole history. Each bar's <title> is its hover tooltip.
 */
export function UsageChart({ days }: { days: DayUsage[] }) {
  const max = Math.max(1, ...days.map((d) => d.calls));
  const labelled = days.length > 1 ? [days[0], days[Math.floor((days.length - 1) / 2)], days[days.length - 1]] : days;

  return (
    <figure className="flex flex-col gap-2" aria-label="Tool calls per day">
      <div className="flex gap-3">
        <div className="flex h-40 flex-col justify-between text-xs text-muted-foreground tabular-nums" aria-hidden>
          <span>{compact.format(max)}</span>
          <span>0</span>
        </div>
        <svg
          viewBox={`0 0 ${days.length} ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${days.length} days of tool calls`}
          className="h-40 flex-1 border-b border-border"
        >
          {days.map((d, i) => {
            const total = (d.calls / max) * HEIGHT;
            const failed = d.calls > 0 ? (d.failures / d.calls) * total : 0;
            return (
              <g key={d.day}>
                <title>
                  {`${dateLabel(d.day)}: ${d.calls.toLocaleString("en-US")} ${d.calls === 1 ? "call" : "calls"}${d.failures > 0 ? `, ${d.failures.toLocaleString("en-US")} failed` : ""}`}
                </title>
                {/* A full-height invisible rect so the tooltip works on empty days too. */}
                <rect x={i} y={0} width={1} height={HEIGHT} className="fill-transparent" />
                <rect x={i + 0.1} y={HEIGHT - total} width={0.8} height={total - failed} className="fill-primary/70" />
                <rect x={i + 0.1} y={HEIGHT - failed} width={0.8} height={failed} className="fill-destructive/70" />
              </g>
            );
          })}
        </svg>
      </div>
      <div className="ml-9 flex justify-between text-xs text-muted-foreground" aria-hidden>
        {labelled.map((d) => (
          <span key={d.day}>{dateLabel(d.day)}</span>
        ))}
      </div>
    </figure>
  );
}
