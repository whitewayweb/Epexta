"use client";

import { Plus } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** A connector URL the organisation's plan includes - only what the browser needs. */
export interface ConnectorLink {
  name: string;
  url: string;
  /** Short id for the Claude Code server name, e.g. "wordpress" for /api/wordpress/mcp. */
  slug: string;
}

const CLIENTS = [
  {
    id: "claude",
    label: "Claude",
    steps: [
      "Open Settings → Connectors and choose Add custom connector.",
      "Name it Epexta and paste the connector URL. Leave the sign-in options as detected.",
      "Sign in to Epexta and approve when asked.",
    ],
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    steps: [
      "Open Settings → Apps and connectors and create a connector. If you don't see Create, turn on developer mode under Advanced settings.",
      "Paste the connector URL and choose OAuth for authentication.",
      "Sign in to Epexta and approve when asked.",
    ],
  },
  {
    id: "claude-code",
    label: "Claude Code",
    steps: [
      "Run the command for the connector you want, shown below.",
      "In Claude Code, run /mcp and choose Authenticate.",
      "Sign in to Epexta and approve when asked.",
    ],
  },
] as const;

function claudeCodeCommand(connector: ConnectorLink): string {
  return `claude mcp add --transport http epexta-${connector.slug} ${connector.url}`;
}

function CopyableValue({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <code className="block min-w-0 flex-1 rounded-md bg-muted px-3 py-2 font-mono text-xs break-all text-foreground">
        {value}
      </code>
      <CopyButton value={value} label={label} />
    </div>
  );
}

/** Per-client steps plus every connector URL (or Claude Code command) to paste. */
export function ConnectorSetup({ connectors }: { connectors: ConnectorLink[] }) {
  if (connectors.length === 0) {
    return <p className="text-sm text-muted-foreground">Your organisation&apos;s plan doesn&apos;t include any connectors yet.</p>;
  }

  return (
    <Tabs defaultValue="claude" className="min-w-0">
      <TabsList>
        {CLIENTS.map((client) => (
          <TabsTrigger key={client.id} value={client.id}>
            {client.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {CLIENTS.map((client) => (
        <TabsContent key={client.id} value={client.id} className="flex flex-col gap-4 pt-2">
          <ol className="flex flex-col gap-2">
            {client.steps.map((step, index) => (
              <li key={step} className="flex gap-3 text-sm">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  {index + 1}
                </span>
                <span className="text-muted-foreground">{step}</span>
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-3">
            {connectors.map((connector) => (
              <div key={connector.url} className="flex min-w-0 flex-col gap-1.5">
                <span className="text-sm font-medium">{connector.name}</span>
                {client.id === "claude-code" ? (
                  <CopyableValue value={claudeCodeCommand(connector)} label={`Copy ${connector.name} command`} />
                ) : (
                  <CopyableValue value={connector.url} label={`Copy ${connector.name} connector URL`} />
                )}
              </div>
            ))}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}

export function ConnectAppDialog({ connectors }: { connectors: ConnectorLink[] }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button />}>
        <Plus />
        Connect an app
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect an app</DialogTitle>
          <DialogDescription>Use Epexta&apos;s tools from Claude or ChatGPT. You&apos;ll sign in to Epexta once to approve it.</DialogDescription>
        </DialogHeader>
        <ConnectorSetup connectors={connectors} />
      </DialogContent>
    </Dialog>
  );
}
