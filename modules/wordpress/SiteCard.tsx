import { ExternalLink, Pencil } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { WordPressIcon } from "@/components/site/wordpress-icon";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format-date";
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
        <StatusBadge tone="success">
          {site.seoProviderObserved ? SEO_PROVIDER_LABELS[site.seoProviderObserved] : "SEO plugin"} detected
        </StatusBadge>
      );
    case "unavailable":
      return <StatusBadge tone="danger">Could not check SEO plugin</StatusBadge>;
    case "unknown":
      return <StatusBadge tone="warning">No SEO plugin detected</StatusBadge>;
    // selected/ambiguous/unsupported aren't reachable yet with only one adapter
    // registered, but this stays exhaustive so a future adapter doesn't fall through.
    case "selected":
    case "ambiguous":
    case "unsupported":
      return <StatusBadge tone="neutral">{site.seoProfileState}</StatusBadge>;
    default:
      return <StatusBadge tone="neutral">Not checked yet</StatusBadge>;
  }
}

export function SiteCard({ site, editable }: { site: DisplayConnection; editable: boolean }) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#21759b] text-white">
            <WordPressIcon className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <CardTitle className="truncate text-base">{site.label || site.siteUrl}</CardTitle>
            <CardDescription>
              <a
                href={site.siteUrl}
                target="_blank"
                rel="noreferrer"
                title={site.siteUrl}
                className="flex max-w-full min-w-0 items-center gap-1 font-mono text-xs hover:text-foreground"
              >
                <span className="truncate">{site.siteUrl.replace(/^https?:\/\//, "")}</span>
                <ExternalLink className="size-3 shrink-0" />
              </a>
            </CardDescription>
          </div>
        </div>
        {editable && (
          <CardAction className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Edit connection" render={<Link href={`/wordpress/connect?edit=${site.connectionId}`} />}>
              <Pencil />
            </Button>
            <RemoveConnectionButton connectionId={site.connectionId} variant="icon" />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <SeoStatusBadge site={site} />
        </div>
        {site.seoProfileState === "unavailable" && site.seoProfileError && (
          <p className="text-xs text-destructive">{site.seoProfileError}</p>
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">WordPress user</dt>
          <dd className="truncate text-right font-mono text-xs leading-5">{site.username}</dd>
          <dt className="text-muted-foreground">SEO last checked</dt>
          <dd className="text-right">{site.seoProfileObservedAt ? formatDate(site.seoProfileObservedAt) : "Never"}</dd>
        </dl>
      </CardContent>
      {editable && (
        <CardFooter className="flex-col items-stretch gap-2 border-t pt-4">
          <span className="text-xs font-medium text-muted-foreground">SEO plugin</span>
          <SeoProviderPreferenceForm connectionId={site.connectionId} seoProviderPreference={site.seoProviderPreference} />
        </CardFooter>
      )}
    </Card>
  );
}
