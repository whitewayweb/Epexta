import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { WordPressIcon } from "@/components/site/wordpress-icon";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SiteActionsMenu } from "./SiteActionsMenu";
import type { DisplayConnection } from "./organisation";

export function SitesTable({ sites, editable }: { sites: DisplayConnection[]; editable: boolean }) {
  return (
    <div className="rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">Label</TableHead>
            <TableHead>Website</TableHead>
            {editable && <TableHead className="w-12 pr-4" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sites.map((site) => {
            const host = site.siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
            const label = site.label || host;
            return (
              <TableRow key={site.connectionId}>
                <TableCell className="pl-4">
                  <div className="flex items-center gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#21759b] text-white">
                      <WordPressIcon className="size-4" />
                    </span>
                    <div className="flex min-w-0 flex-col">
                      {editable ? (
                        <Link
                          href={`/wordpress/connect?edit=${site.connectionId}`}
                          title="Edit connection"
                          className="truncate font-medium hover:underline"
                        >
                          {label}
                        </Link>
                      ) : (
                        <span className="truncate font-medium">{label}</span>
                      )}
                      <span className="truncate font-mono text-xs text-muted-foreground">{site.username}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <a
                    href={site.siteUrl}
                    target="_blank"
                    rel="noreferrer"
                    title={site.siteUrl}
                    className="inline-flex max-w-full items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
                  >
                    <span className="truncate">{host}</span>
                    <ExternalLink className="size-3 shrink-0" />
                  </a>
                </TableCell>
                {editable && (
                  <TableCell className="pr-4 text-right">
                    <SiteActionsMenu connectionId={site.connectionId} label={label} />
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
