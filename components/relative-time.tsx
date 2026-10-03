"use client";

import { useSyncExternalStore } from "react";
import { formatDate, formatRelativeTime } from "@/lib/format-date";

const noopSubscribe = () => () => {};

/** "2 minutes ago" once mounted; the absolute date on the server render and as a tooltip. */
export function RelativeTime({ iso }: { iso: string }) {
  // False during the server render and hydration, true after - so both renders match.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  return (
    <time dateTime={iso} title={formatDate(iso)}>
      {mounted ? formatRelativeTime(iso) : formatDate(iso)}
    </time>
  );
}
