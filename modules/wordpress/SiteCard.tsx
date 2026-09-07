"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent } from "react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RemoveConnectionButton } from "./RemoveConnectionButton";
import type { DisplayConnection } from "./organisation";

export function SiteCard({ site, editable }: { site: DisplayConnection; editable: boolean }) {
  const router = useRouter();
  const editHref = `/wordpress/connect?edit=${site.connectionId}`;

  if (!editable) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{site.label || site.siteUrl}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>{site.siteUrl}</p>
          <p>{site.username}</p>
        </CardContent>
      </Card>
    );
  }

  const openEdit = () => router.push(editHref);
  const stopPropagation = (event: MouseEvent | KeyboardEvent) => event.stopPropagation();

  return (
    <Card
      role="link"
      tabIndex={0}
      onClick={openEdit}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openEdit();
        }
      }}
      className="cursor-pointer transition-colors hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <CardHeader>
        <CardTitle className="text-base">{site.label || site.siteUrl}</CardTitle>
        <CardAction onClick={stopPropagation} onKeyDown={stopPropagation}>
          <RemoveConnectionButton connectionId={site.connectionId} variant="icon" />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-1 text-sm text-muted-foreground">
        <p>{site.siteUrl}</p>
        <p>{site.username}</p>
      </CardContent>
    </Card>
  );
}
