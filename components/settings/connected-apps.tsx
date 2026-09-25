"use client";

import { Unplug } from "lucide-react";
import { type ReactNode, useActionState, useEffect, useState, useSyncExternalStore } from "react";
import { type ConnectorLink, ConnectorSetup } from "@/components/settings/connector-setup";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, formatRelativeTime } from "@/lib/format-date";
import { disconnectAppAction, type DisconnectAppState } from "@/lib/oauth/actions";
import type { ConnectedApp } from "@/lib/oauth/provider";

type Scope = "own" | "organisation";

const noopSubscribe = () => () => {};

const disconnectInitialState: DisconnectAppState = { error: null, success: false };

/** "2 minutes ago" once mounted; the absolute date on the server render and as a tooltip. */
function RelativeTime({ iso }: { iso: string }) {
  // False during the server render and hydration, true after - so both renders match.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  return (
    <time dateTime={iso} title={formatDate(iso)}>
      {mounted ? formatRelativeTime(iso) : formatDate(iso)}
    </time>
  );
}

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
    <form action={formAction} className="flex shrink-0 items-center gap-2">
      {state.error && <span className="text-xs text-destructive">{state.error}</span>}
      <input type="hidden" name="connectionId" value={connectionId} />
      <input type="hidden" name="scope" value={scope} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        <Unplug />
        {pending ? "Disconnecting…" : "Disconnect"}
      </Button>
    </form>
  );
}

function AppRow({
  app,
  scope,
  isYou,
  onDisconnected,
}: {
  app: ConnectedApp;
  scope: Scope;
  isYou: boolean;
  onDisconnected: (id: string) => void;
}) {
  return (
    <li className="flex items-center gap-3 py-3">
      <div
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground"
      >
        {app.clientName.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium">{app.clientName}</span>
          <span className="text-xs text-muted-foreground">{app.clientHost}</span>
          {scope === "organisation" &&
            (isYou ? (
              <Badge variant="secondary">You</Badge>
            ) : (
              <span className="max-w-56 truncate text-xs text-muted-foreground" title={app.userEmail}>
                {app.userEmail}
              </span>
            ))}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {app.connectorName}
          {" · "}
          Connected {formatDate(app.connectedAt)}
          {" · "}
          {app.lastUsedAt ? (
            <>
              Used <RelativeTime iso={app.lastUsedAt} />
            </>
          ) : (
            "Not used yet"
          )}
          {app.sessions > 1 && ` · ${app.sessions} sessions`}
        </div>
      </div>
      <DisconnectButton connectionId={app.connectionId} scope={scope} onDisconnected={onDisconnected} />
    </li>
  );
}

function AppList({
  apps,
  scope,
  currentUserId,
  onDisconnected,
  empty,
}: {
  apps: ConnectedApp[];
  scope: Scope;
  currentUserId: string;
  onDisconnected: (id: string) => void;
  empty: ReactNode;
}) {
  if (apps.length === 0) return <>{empty}</>;
  return (
    <ul className="divide-y divide-border">
      {apps.map((app) => (
        <AppRow
          key={app.connectionId}
          app={app}
          scope={scope}
          isYou={app.userId === currentUserId}
          onDisconnected={onDisconnected}
        />
      ))}
    </ul>
  );
}

/**
 * The user's own connections and, for an organisation admin (`organisationApps` non-null),
 * every member's - one list with a switch rather than two tables, so an admin's own
 * connection isn't listed twice. A connection's id is the same in both lists, so a
 * disconnect removes it from both.
 */
export function ConnectedApps({
  ownApps,
  organisationApps,
  currentUserId,
  connectors,
}: {
  ownApps: ConnectedApp[];
  organisationApps: ConnectedApp[] | null;
  currentUserId: string;
  connectors: ConnectorLink[];
}) {
  const [own, setOwn] = useState(ownApps);
  const [organisation, setOrganisation] = useState(organisationApps);

  const removeConnection = (id: string) => {
    setOwn((prev) => prev.filter((app) => app.connectionId !== id));
    setOrganisation((prev) => prev && prev.filter((app) => app.connectionId !== id));
  };

  const ownList = (
    <AppList
      apps={own}
      scope="own"
      currentUserId={currentUserId}
      onDisconnected={removeConnection}
      empty={
        <div className="flex flex-col gap-4 rounded-lg border border-dashed border-border p-5">
          <div>
            <p className="font-medium">Connect your first app</p>
            <p className="text-sm text-muted-foreground">
              Add Epexta to Claude or ChatGPT to use its tools there. It shows up here once you&apos;ve approved it.
            </p>
          </div>
          <ConnectorSetup connectors={connectors} />
        </div>
      }
    />
  );

  if (!organisation) return ownList;

  return (
    <Tabs defaultValue="own">
      <TabsList>
        <TabsTrigger value="own">Yours · {own.length}</TabsTrigger>
        <TabsTrigger value="organisation">Organisation · {organisation.length}</TabsTrigger>
      </TabsList>
      {/* keepMounted: a disconnect still in flight finishes even if the admin switches tabs. */}
      <TabsContent value="own" keepMounted>
        {ownList}
      </TabsContent>
      <TabsContent value="organisation" keepMounted>
        <p className="pt-2 text-sm text-muted-foreground">
          Every member&apos;s connections. As an admin you can disconnect any of them.
        </p>
        <AppList
          apps={organisation}
          scope="organisation"
          currentUserId={currentUserId}
          onDisconnected={removeConnection}
          empty={<p className="py-6 text-center text-sm text-muted-foreground">No one in your organisation has connected an app yet.</p>}
        />
      </TabsContent>
    </Tabs>
  );
}
