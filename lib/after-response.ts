import { after } from "next/server";

/**
 * Runs non-essential bookkeeping (a "last used" timestamp, say) after the response has
 * been sent, via Next's `after()` - which keeps the function alive for it on Vercel,
 * unlike an un-awaited promise. Outside a request scope (tests, scripts) `after()` throws,
 * so the task simply runs now. A failing task is logged, never surfaced to the caller.
 */
export function runAfterResponse(label: string, task: () => Promise<unknown>): void {
  const run = () => task().catch((error) => console.error(`[${label}] background task failed:`, error));
  try {
    after(run);
  } catch {
    void run();
  }
}
