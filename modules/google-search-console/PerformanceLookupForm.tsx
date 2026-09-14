"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SearchConsoleMapping } from "./mappings";
import { getPerformanceAction, type PerformanceState } from "./actions";

const initialState: PerformanceState = { error: null, data: null };

interface PerformanceLookupFormProps {
  mappings: SearchConsoleMapping[];
  siteLabel: (wordpressConnectionId: string) => string;
}

export function PerformanceLookupForm({ mappings, siteLabel }: PerformanceLookupFormProps) {
  const [state, formAction, pending] = useActionState(getPerformanceAction, initialState);

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex max-w-md flex-col gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="wordpressConnectionId">Site</Label>
          <Select name="wordpressConnectionId">
            <SelectTrigger id="wordpressConnectionId">
              <SelectValue placeholder="Select a mapped site" />
            </SelectTrigger>
            <SelectContent>
              {mappings.map((m) => (
                <SelectItem key={m.mappingId} value={m.wordpressConnectionId}>
                  {siteLabel(m.wordpressConnectionId)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="postId">WordPress post ID</Label>
          <Input id="postId" type="number" name="postId" required placeholder="123" />
        </div>

        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Loading…" : "Get performance"}
        </Button>
      </form>

      {state.data && (
        <Card className="max-w-md">
          <CardContent className="flex flex-col gap-2 py-4 text-sm">
            <span className="font-medium">{state.data.canonicalPostUrl}</span>
            <span className="text-xs text-muted-foreground">
              {state.data.dateRangeStart} to {state.data.dateRangeEnd} ({state.data.timezone})
              {state.data.refreshPending ? " — refresh in progress, showing last known data" : ""}
            </span>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Clicks</div>
                <div className="text-lg font-semibold">{state.data.metrics.clicks}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Impressions</div>
                <div className="text-lg font-semibold">{state.data.metrics.impressions}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">CTR</div>
                <div className="text-lg font-semibold">{(state.data.metrics.ctr * 100).toFixed(1)}%</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Avg. position</div>
                <div className="text-lg font-semibold">{state.data.metrics.position.toFixed(1)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
