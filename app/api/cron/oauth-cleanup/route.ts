import { oauthProvider } from "@/lib/oauth/provider";

// Daily OAuth housekeeping, scheduled in vercel.json. Vercel Cron calls this with
// `Authorization: Bearer $CRON_SECRET`; anything else is refused, and with no
// CRON_SECRET configured the job refuses to run at all rather than being publicly callable.
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await oauthProvider.purgeExpiredRecords();
  return Response.json(result);
}
