import { Plus } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format-date";
import type { PublicConnection } from "./index";

const STATUS: Record<PublicConnection["status"], { tone: "success" | "warning" | "neutral"; label: string }> = {
  active: { tone: "success", label: "Connected" },
  needs_reconnect: { tone: "warning", label: "Needs reconnecting" },
  revoked: { tone: "neutral", label: "Disconnected" },
};

/** Each Google module's own Server Actions, so a connection is always made for that module's capability. */
export interface GoogleConnectionActions {
  connect: () => Promise<void>;
  reconnect: (formData: FormData) => Promise<void>;
  revoke: (formData: FormData) => Promise<void>;
  disconnect: (formData: FormData) => Promise<void>;
}

function ConnectionAction({ action, connectionId, children }: { action: (formData: FormData) => Promise<void>; connectionId: string; children: React.ReactNode }) {
  return (
    <form action={action}>
      <input type="hidden" name="connectionId" value={connectionId} />
      {children}
    </form>
  );
}

/** The Google accounts one Google module (Search Console or Analytics) reads through. */
export function ConnectionsPanel({
  connections,
  productName,
  actions,
}: {
  connections: PublicConnection[];
  productName: string;
  actions: GoogleConnectionActions;
}) {
  return (
    <div className="flex flex-col gap-4">
      {connections.length === 0 ? (
        <p className="text-sm text-muted-foreground">No Google account connected for {productName} yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {connections.map((connection) => (
            <li key={connection.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-sm font-medium">{connection.googleAccountLabel}</span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <StatusBadge tone={STATUS[connection.status].tone}>{STATUS[connection.status].label}</StatusBadge>
                  {connection.lastValidatedAt && `Checked ${formatDate(connection.lastValidatedAt)}`}
                </span>
              </div>
              <div className="flex gap-2">
                {connection.status === "needs_reconnect" && (
                  <ConnectionAction action={actions.reconnect} connectionId={connection.id}>
                    <Button type="submit" size="sm">
                      Reconnect
                    </Button>
                  </ConnectionAction>
                )}
                {connection.status === "active" && (
                  <ConnectionAction action={actions.revoke} connectionId={connection.id}>
                    <Button type="submit" size="sm" variant="outline">
                      Disconnect
                    </Button>
                  </ConnectionAction>
                )}
                <ConnectionAction action={actions.disconnect} connectionId={connection.id}>
                  <Button type="submit" size="sm" variant="destructive">
                    Remove
                  </Button>
                </ConnectionAction>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form action={actions.connect}>
        <Button type="submit" variant={connections.length === 0 ? "default" : "outline"}>
          <Plus />
          Connect a Google account
        </Button>
      </form>
    </div>
  );
}
