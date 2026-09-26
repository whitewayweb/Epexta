"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** The part of a Google module's post-performance result this form shows. */
interface PerformanceResult<Metrics> {
  canonicalPostUrl: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  timezone: string;
  refreshPending: boolean;
  metrics: Metrics;
}

interface PerformanceState<Data> {
  error: string | null;
  data: Data | null;
}

/** How to show one metric - plain data, so a server page can pass it to this client form. */
interface MetricDisplay<Metrics> {
  key: keyof Metrics & string;
  label: string;
  format: "count" | "percent" | "decimal";
}

const countFormat = new Intl.NumberFormat("en-US");

function formatMetric(value: number, format: MetricDisplay<object>["format"]): string {
  if (format === "percent") return `${(value * 100).toFixed(1)}%`;
  if (format === "decimal") return value.toFixed(1);
  return countFormat.format(value);
}

/**
 * Looks up one post's numbers through a Google module's own `getPerformanceAction` -
 * Search Console and Analytics differ only in the action and which metrics they show.
 */
export function PerformanceLookupForm<Data extends PerformanceResult<object>>({
  sites,
  action,
  metrics,
}: {
  sites: { id: string; label: string }[];
  action: (state: PerformanceState<Data>, formData: FormData) => Promise<PerformanceState<Data>>;
  metrics: MetricDisplay<Data["metrics"]>[];
}) {
  const [state, formAction, pending] = useActionState(action, { error: null, data: null });
  const result = state.data;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent>
          <form action={formAction} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="wordpressConnectionId">Site</Label>
              <Select name="wordpressConnectionId" items={Object.fromEntries(sites.map((site) => [site.id, site.label]))}>
                <SelectTrigger id="wordpressConnectionId" className="w-full">
                  <SelectValue placeholder="Select a mapped site" />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="postId">WordPress post ID</Label>
              <Input id="postId" type="number" name="postId" required placeholder="123" />
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Loading…" : "Get performance"}
            </Button>
            {state.error && <p className="text-sm text-destructive sm:col-span-3">{state.error}</p>}
          </form>
        </CardContent>
      </Card>

      {result && (
        <Card className="gap-0 pb-0">
          <CardHeader className="border-b pb-4">
            <CardTitle className="font-mono text-sm break-all">{result.canonicalPostUrl}</CardTitle>
            <CardDescription>
              {result.dateRangeStart} to {result.dateRangeEnd} ({result.timezone})
              {result.refreshPending && ". Refreshing now, so these are the last numbers we had."}
            </CardDescription>
          </CardHeader>
          <dl className="grid grid-cols-2 divide-y sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            {metrics.map((metric) => (
              <div key={metric.key} className="flex flex-col gap-1 px-6 py-4">
                <dt className="text-xs text-muted-foreground">{metric.label}</dt>
                <dd className="text-2xl font-semibold tracking-tight tabular-nums">
                  {formatMetric(Number((result.metrics as Data["metrics"])[metric.key]), metric.format)}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
    </div>
  );
}
