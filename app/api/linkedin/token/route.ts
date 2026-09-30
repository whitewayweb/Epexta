import { NextResponse } from "next/server";
import { parseReturnUrl, readHandoff } from "@/modules/linkedin/oauth";

// Server-to-server: the plugin's PHP posts the handoff code it received in the redirect,
// plus its own site URL. The handoff is sealed to the origin the user approved, so a code
// copied from a URL is useless without also claiming that site. Called from a server, so no CORS.
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as { code?: unknown; site?: unknown } | null;
  const handoff = typeof body?.code === "string" ? readHandoff(body.code) : null;
  const site = parseReturnUrl(body?.site);

  if (!handoff || !site || site.origin !== handoff.origin) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json(
    { access_token: handoff.accessToken, expires_in: handoff.expiresIn, scope: handoff.scope },
    { headers: { "Cache-Control": "no-store" } },
  );
}
