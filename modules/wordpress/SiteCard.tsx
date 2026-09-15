"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RemoveConnectionButton } from "./RemoveConnectionButton";
import { SeoProviderPreferenceForm } from "./SeoProviderPreferenceForm";
import type { DisplayConnection } from "./organisation";

const SEO_PROVIDER_LABELS: Record<"yoast" | "rank-math" | "aioseo", string> = {
  yoast: "Yoast SEO",
  "rank-math": "Rank Math",
  aioseo: "All in One SEO",
};

function SeoStatusBadge({ site }: { site: DisplayConnection }) {
  switch (site.seoProfileState) {
    case "confirmed":
      return (
        <Badge>
          {site.seoProviderObserved ? SEO_PROVIDER_LABELS[site.seoProviderObserved] : "SEO plugin"} detected
        </Badge>
      );
    case "unavailable":
      return <Badge variant="destructive">Could not check SEO plugin</Badge>;
    case "unknown":
      return <Badge variant="secondary">No SEO plugin detected</Badge>;
    // selected/ambiguous/unsupported aren't reachable yet with only one adapter
    // registered, but this stays exhaustive so a future adapter doesn't fall through.
    case "selected":
    case "ambiguous":
    case "unsupported":
      return <Badge variant="secondary">{site.seoProfileState}</Badge>;
    default:
      return <Badge variant="outline">Not checked yet</Badge>;
  }
}

function SiteMeta({ site }: { site: DisplayConnection }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SeoStatusBadge site={site} />
      {site.seoProfileObservedAt && (
        <span className="text-xs text-muted-foreground">
          Checked {new Date(site.seoProfileObservedAt).toISOString().slice(0, 10)}
        </span>
      )}
      {site.seoProfileState === "unavailable" && site.seoProfileError && (
        <span className="text-xs text-destructive">{site.seoProfileError}</span>
      )}
    </div>
  );
}

export function SiteCard({ site, editable }: { site: DisplayConnection; editable: boolean }) {
  const router = useRouter();
  const editHref = `/wordpress/connect?edit=${site.connectionId}`;

  if (!editable) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{site.label || site.siteUrl}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>{site.siteUrl}</p>
          <p>{site.username}</p>
          <SiteMeta site={site} />
        </CardContent>
      </Card>
    );
  }

  const openEdit = () => router.push(editHref);
  const stopPropagation = (event: MouseEvent | KeyboardEvent) => event.stopPropagation();

  return (
    <Card
      role="link"
      tabIndex={0}
      onClick={openEdit}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openEdit();
        }
      }}
      className="cursor-pointer transition-colors hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <CardHeader>
        <CardTitle className="text-base">{site.label || site.siteUrl}</CardTitle>
        <CardAction onClick={stopPropagation} onKeyDown={stopPropagation}>
          <RemoveConnectionButton connectionId={site.connectionId} variant="icon" />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>{site.siteUrl}</p>
        <p>{site.username}</p>
        <SiteMeta site={site} />
        <SeoProviderPreferenceForm
          connectionId={site.connectionId}
          seoProviderPreference={site.seoProviderPreference}
        />
      </CardContent>
    </Card>
  );
}
