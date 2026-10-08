import { purgeExpiredActivity } from "@/lib/activity";
import { rollUpActivity } from "@/lib/usage-rollup";

// Daily activity-log housekeeping, scheduled in vercel.json: first fold finished days into the
// long-term usage rollup, then delete raw events past retention (never any the rollup hasn't
// folded in - a failed rollup throws here, so the purge doesn't run). Same protection as
// oauth-cleanup: Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`; anything
// else is refused, and with no CRON_SECRET configured the job refuses to run at all.
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const rolledUp = await rollUpActivity();
  return Response.json({ rolledUp, deleted: await purgeExpiredActivity() });
}
