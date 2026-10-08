import { purgeExpiredUsage } from "@/lib/plans/usage";

// Daily tool-call meter retention, scheduled in vercel.json. Same protection as the other
// cron jobs: Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`; anything else
// is refused, and with no CRON_SECRET configured the job refuses to run at all.
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  return Response.json({ deleted: await purgeExpiredUsage() });
}
