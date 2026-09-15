"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateSeoProviderPreferenceAction, type SeoProviderPreferenceState } from "./actions";
import type { SeoProviderPreference } from "./organisation";

const initialState: SeoProviderPreferenceState = { error: null, success: false };

const PREFERENCE_LABELS: Record<SeoProviderPreference, string> = {
  auto: "Auto-detect",
  yoast: "Yoast SEO",
  "rank-math": "Rank Math",
  aioseo: "All in One SEO",
};

export function SeoProviderPreferenceForm({
  connectionId,
  seoProviderPreference,
}: {
  connectionId: string;
  seoProviderPreference: SeoProviderPreference;
}) {
  const [state, formAction, pending] = useActionState(updateSeoProviderPreferenceAction, initialState);
  const stopPropagation = (event: MouseEvent | KeyboardEvent) => event.stopPropagation();

  return (
    <form
      action={formAction}
      onClick={stopPropagation}
      onKeyDown={stopPropagation}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="connectionId" value={connectionId} />
      {/* Keyed on the server value so a revalidated re-render after saving remounts the
          (uncontrolled) Select with the new defaultValue instead of warning about changing
          an already-initialized uncontrolled component's default. */}
      <Select key={seoProviderPreference} name="seoProviderPreference" defaultValue={seoProviderPreference} items={PREFERENCE_LABELS}>
        <SelectTrigger id={`seoProviderPreference-${connectionId}`} size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(PREFERENCE_LABELS) as SeoProviderPreference[]).map((value) => (
            <SelectItem key={value} value={value}>
              {PREFERENCE_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      {state.error && <p className="w-full text-xs text-destructive">{state.error}</p>}
    </form>
  );
}
