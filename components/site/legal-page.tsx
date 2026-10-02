import type React from "react";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

export const LEGAL_LAST_UPDATED = "2 October 2026";

/** Shared shell for the public legal pages (/terms, /privacy). */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {LEGAL_LAST_UPDATED}</p>
        <div className="mt-10 flex flex-col gap-4 leading-relaxed text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-foreground">
          {children}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
