"use client";

import { KeyRound, Plus, Trash2 } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  createApiKeyAction,
  deleteApiKeyAction,
  type CreateApiKeyState,
  type DeleteApiKeyState,
} from "@/lib/api-key-actions";
import { formatDate } from "@/lib/format-date";

interface ApiKeyRow {
  id: string;
  name: string;
  createdAt: string;
}

const createInitialState: CreateApiKeyState = { error: null, key: null };
const deleteInitialState: DeleteApiKeyState = { error: null, success: false };

// Generated in the browser with the Web Crypto API so the key is already visible
// (and copyable) the moment the dialog opens, instead of after a round trip to the
// server just to name and store it.
function generateRawKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function DeleteKeyButton({ keyId, onDeleted }: { keyId: string; onDeleted: (id: string) => void }) {
  const [state, formAction, pending] = useActionState(deleteApiKeyAction, deleteInitialState);

  useEffect(() => {
    if (state.success) onDeleted(keyId);
  }, [state.success, keyId, onDeleted]);

  return (
    <form action={formAction}>
      <input type="hidden" name="keyId" value={keyId} />
      <Button type="submit" variant="ghost" size="icon-sm" disabled={pending} aria-label="Delete key">
        <Trash2 />
      </Button>
    </form>
  );
}

function CreateKeyForm({
  onCreated,
  onDone,
}: {
  onCreated: (key: ApiKeyRow) => void;
  onDone: () => void;
}) {
  const [rawKey] = useState(generateRawKey);
  const [state, formAction, pending] = useActionState(createApiKeyAction, createInitialState);

  useEffect(() => {
    if (state.key) onCreated(state.key);
    // Only react to a fresh action result, not to onCreated identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.key]);

  const keyField = (
    <div className="flex min-w-0 items-center gap-2">
      <code className="block min-w-0 flex-1 break-all rounded-md bg-muted px-3 py-2 font-mono text-sm text-foreground">
        {rawKey}
      </code>
      <CopyButton value={rawKey} label="Copy key" />
    </div>
  );

  if (state.key) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>&quot;{state.key.name}&quot; saved</DialogTitle>
          <DialogDescription>Copy this now, it won&apos;t be shown again.</DialogDescription>
        </DialogHeader>
        {keyField}
        <DialogFooter>
          <Button onClick={onDone}>Done</Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="rawKey" value={rawKey} />
      <DialogHeader>
        <DialogTitle>Add new key</DialogTitle>
        <DialogDescription>Copy it now, then name it so you can recognize it later.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3 py-2">
        {keyField}
        <div className="grid gap-1.5">
          <Label htmlFor="api-key-name">Name</Label>
          <Input id="api-key-name" name="name" required autoFocus placeholder="e.g. Publishing script" />
        </div>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function CreateKeyDialog({ onCreated }: { onCreated: (key: ApiKeyRow) => void }) {
  const [open, setOpen] = useState(false);
  // Remounts the form (and its useActionState) each time the dialog opens, so a
  // previously-revealed key never reappears when adding another one.
  const [formKey, setFormKey] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setFormKey((k) => k + 1);
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <Plus />
        Create key
      </DialogTrigger>
      <DialogContent>
        <CreateKeyForm key={formKey} onCreated={onCreated} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function ApiKeysTable({ initialKeys }: { initialKeys: ApiKeyRow[] }) {
  const [keys, setKeys] = useState(initialKeys);

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>Your keys</CardTitle>
        <CardDescription>Each key acts as you, with your role in your organisation.</CardDescription>
        <CardAction>
          <CreateKeyDialog
            onCreated={(key) => {
              setKeys((prev) => [key, ...prev]);
            }}
          />
        </CardAction>
      </CardHeader>

      {keys.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <KeyRound />
            </EmptyMedia>
            <EmptyTitle>No API keys yet</EmptyTitle>
            <EmptyDescription>Create one for a script or tool that sends a bearer token.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="pl-4">Name</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-px pr-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((key) => (
              <TableRow key={key.id}>
                <TableCell className="pl-4 font-medium">{key.name}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(key.createdAt)}</TableCell>
                <TableCell className="pr-4">
                  <DeleteKeyButton
                    keyId={key.id}
                    onDeleted={(id) => {
                      setKeys((prev) => prev.filter((k) => k.id !== id));
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
