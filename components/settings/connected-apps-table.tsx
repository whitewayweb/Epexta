"use client";

import { Unplug } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format-date";
import { disconnectAppAction, type DisconnectAppState } from "@/lib/oauth/actions";
import type { ConnectedApp } from "@/lib/oauth/provider";

type Scope = "own" | "organisation";

const disconnectInitialState: DisconnectAppState = { error: null, success: false };

function DisconnectButton({
  connectionId,
  scope,
  onDisconnected,
}: {
  connectionId: string;
  scope: Scope;
  onDisconnected: (id: string) => void;
}) {
  const [state, formAction, pending] = useActionState(disconnectAppAction, disconnectInitialState);

  useEffect(() => {
    if (state.success) onDisconnected(connectionId);
  }, [state.success, connectionId, onDisconnected]);

  return (
    <form action={formAction} className="flex items-center justify-end gap-2">
      {state.error && <span className="text-xs text-destructive">{state.error}</span>}
      <input type="hidden" name="connectionId" value={connectionId} />
      <input type="hidden" name="scope" value={scope} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        <Unplug />
        Disconnect
      </Button>
    </form>
  );
}

/**
 * One row per connection (an app on a connector, possibly several devices or sessions).
 * `scope` "organisation" is an organisation admin's view of every member's connections.
 */
export function ConnectedAppsTable({ initialApps, scope }: { initialApps: ConnectedApp[]; scope: Scope }) {
  const [apps, setApps] = useState(initialApps);
  const showMember = scope === "organisation";

  if (apps.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
        No apps connected yet.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {showMember && <TableHead>Member</TableHead>}
          <TableHead>App</TableHead>
          <TableHead>Connector</TableHead>
          <TableHead>Connected</TableHead>
          <TableHead>Last used</TableHead>
          <TableHead className="w-px" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {apps.map((app) => (
          <TableRow key={app.connectionId}>
            {showMember && (
              <TableCell className="max-w-48 truncate" title={app.userEmail}>
                {app.userEmail}
              </TableCell>
            )}
            <TableCell>
              <div className="font-medium">{app.clientName}</div>
              <div className="text-xs text-muted-foreground">
                {[app.clientHost, app.sessions > 1 ? `${app.sessions} sessions` : null].filter(Boolean).join(" · ")}
              </div>
            </TableCell>
            <TableCell>{app.connectorName}</TableCell>
            <TableCell className="text-muted-foreground">{formatDate(app.connectedAt)}</TableCell>
            <TableCell className="text-muted-foreground">{app.lastUsedAt ? formatDate(app.lastUsedAt) : "Never"}</TableCell>
            <TableCell>
              <DisconnectButton
                connectionId={app.connectionId}
                scope={scope}
                onDisconnected={(id) => setApps((prev) => prev.filter((a) => a.connectionId !== id))}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
