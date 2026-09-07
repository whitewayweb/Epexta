"use client";

import { Check, Copy, Plus, Trash2 } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  createApiKeyAction,
  deleteApiKeyAction,
  type CreateApiKeyState,
  type DeleteApiKeyState,
} from "@/lib/api-key-actions";

interface ApiKeyRow {
  id: string;
  name: string;
  createdAt: string;
}

const createInitialState: CreateApiKeyState = { error: null, key: null };
const deleteInitialState: DeleteApiKeyState = { error: null, success: false };

function formatDate(iso: string): string {
  // A fixed locale (not the browser's) keeps this identical between server and
  // client render output, avoiding a hydration mismatch.
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

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

function CopyKeyButton({ rawKey }: { rawKey: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      aria-label="Copy key"
      onClick={async () => {
        await navigator.clipboard.writeText(rawKey);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check /> : <Copy />}
    </Button>
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
    <div className="flex items-center gap-2">
      <code className="block flex-1 break-all rounded-md bg-muted px-3 py-2 font-mono text-sm text-foreground">
        {rawKey}
      </code>
      <CopyKeyButton rawKey={rawKey} />
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
          <Input id="api-key-name" name="name" required autoFocus placeholder="e.g. ChatGPT connector" />
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
        Add new key
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Paste a key into ChatGPT&apos;s custom connector setup as the bearer token.
        </p>
        <CreateKeyDialog
          onCreated={(key) => {
            setKeys((prev) => [key, ...prev]);
          }}
        />
      </div>

      {keys.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          No API keys yet. Add one to connect ChatGPT.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-px" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((key) => (
              <TableRow key={key.id}>
                <TableCell className="font-medium">{key.name}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(key.createdAt)}</TableCell>
                <TableCell>
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
    </div>
  );
}
