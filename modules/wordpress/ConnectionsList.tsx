"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { removeConnectionAction, type ConnectionState } from "./actions";
import { ConnectionForm } from "./ConnectionForm";

// The Application Password is deliberately excluded - this is a client component, and a
// decrypted secret must never be serialized into props sent to the browser.
export type DisplayConnection = { connectionId: string; label: string; siteUrl: string; username: string };

const initialState: ConnectionState = { error: null, success: false };

function RemoveConnectionButton({ connectionId }: { connectionId: string }) {
  const [state, formAction, pending] = useActionState(removeConnectionAction, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="connectionId" value={connectionId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Removing…" : "Remove"}
      </Button>
      {state.error && <p className="mt-1 text-xs text-destructive">{state.error}</p>}
    </form>
  );
}

function ConnectionRow({
  connection,
  editing,
  onEdit,
  onCancel,
}: {
  connection: DisplayConnection;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
}) {
  if (editing) {
    return (
      <div className="rounded-md border border-border/60 p-4">
        <ConnectionForm
          mode="edit"
          connectionId={connection.connectionId}
          label={connection.label}
          siteUrl={connection.siteUrl}
          username={connection.username}
          onCancel={onCancel}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border/60 p-4">
      <div>
        {connection.label && <p className="text-sm font-medium">{connection.label}</p>}
        <p className="text-sm text-muted-foreground">
          {connection.siteUrl} · {connection.username}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <RemoveConnectionButton connectionId={connection.connectionId} />
      </div>
    </div>
  );
}

export function ConnectionsList({
  connections,
  initialEditId,
}: {
  connections: DisplayConnection[];
  initialEditId?: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(initialEditId ?? null);

  if (connections.length === 0) {
    return <p className="text-sm text-muted-foreground">No WordPress sites connected yet.</p>;
  }

  return (
    <div className="flex max-w-md flex-col gap-3">
      {connections.map((connection) => (
        <ConnectionRow
          key={connection.connectionId}
          connection={connection}
          editing={editingId === connection.connectionId}
          onEdit={() => setEditingId(connection.connectionId)}
          onCancel={() => setEditingId(null)}
        />
      ))}
    </div>
  );
}
