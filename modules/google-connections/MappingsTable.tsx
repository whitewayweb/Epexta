import { StatusBadge } from "@/components/status-badge";
import { WordPressIcon } from "@/components/site/wordpress-icon";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** Both Google modules' site-to-property mappings share these states (see their mappings.ts). */
type MappingStatus = "active" | "needs_reconnect" | "needs_remapping" | "superseded";

const STATUS: Record<MappingStatus, { tone: "success" | "warning" | "neutral"; label: string }> = {
  active: { tone: "success", label: "Active" },
  needs_reconnect: { tone: "warning", label: "Reconnect Google" },
  needs_remapping: { tone: "warning", label: "Needs mapping" },
  superseded: { tone: "neutral", label: "Replaced" },
};

export interface MappingRow {
  id: string;
  siteLabel: string;
  property: string;
  status: MappingStatus;
}

/** Which WordPress site reports through which Google property - Search Console and Analytics alike. */
export function MappingsTable({ rows, propertyHeading }: { rows: MappingRow[]; propertyHeading: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableHead className="pl-4">WordPress site</TableHead>
          <TableHead>{propertyHeading}</TableHead>
          <TableHead className="pr-4">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="pl-4">
              <span className="flex items-center gap-2.5 font-medium">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted/50 text-muted-foreground">
                  <WordPressIcon className="size-4" />
                </span>
                {row.siteLabel}
              </span>
            </TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">{row.property}</TableCell>
            <TableCell className="pr-4">
              <StatusBadge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</StatusBadge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
