"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PublicConnection } from "@/modules/google-connections";
import { connectGoogleAction, disconnectGoogleAction, reconnectGoogleAction, revokeGoogleAction } from "./actions";

function statusBadgeVariant(status: PublicConnection["status"]): "default" | "secondary" | "destructive" {
  if (status === "active") return "default";
  if (status === "needs_reconnect") return "destructive";
  return "secondary";
}

export function ConnectionsPanel({ connections }: { connections: PublicConnection[] }) {
  return (
    <div className="flex flex-col gap-4">
      {connections.length === 0 ? (
        <p className="text-sm text-muted-foreground">No Google account connected yet for Analytics.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {connections.map((connection) => (
            <li
              key={connection.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
            >
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">{connection.googleAccountLabel}</span>
                <Badge variant={statusBadgeVariant(connection.status)} className="w-fit">
                  {connection.status.replace("_", " ")}
                </Badge>
              </div>
              <div className="flex gap-2">
                {connection.status === "needs_reconnect" && (
                  <form action={reconnectGoogleAction}>
                    <input type="hidden" name="connectionId" value={connection.id} />
                    <Button type="submit" size="sm" variant="outline">
                      Reconnect
                    </Button>
                  </form>
                )}
                {connection.status === "active" && (
                  <form action={revokeGoogleAction}>
                    <input type="hidden" name="connectionId" value={connection.id} />
                    <Button type="submit" size="sm" variant="outline">
                      Disconnect
                    </Button>
                  </form>
                )}
                <form action={disconnectGoogleAction}>
                  <input type="hidden" name="connectionId" value={connection.id} />
                  <Button type="submit" size="sm" variant="destructive">
                    Remove
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form action={connectGoogleAction}>
        <Button type="submit" className="self-start">
          Connect a Google account
        </Button>
      </form>
    </div>
  );
}
