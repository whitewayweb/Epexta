import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { createHandoff, exchangeCodeForToken, parseReturnUrl, readState } from "@/modules/linkedin/oauth";

// LinkedIn redirects here (register this URL on the LinkedIn app). Never log the query
// string - it carries the authorization code. The result goes back to the plugin as
// `epexta_code` (a short-lived sealed handoff, redeemed at /api/linkedin/token) or
// `epexta_error`; the access token itself never appears in a URL.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const state = params.get("state");
  const payload = state ? readState(state) : null;
  const returnUrl = payload ? parseReturnUrl(payload.returnUrl) : null;

  if (!payload || !returnUrl) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const fail = (reason: string) => {
    returnUrl.searchParams.set("epexta_error", reason);
    return NextResponse.redirect(returnUrl);
  };

  if (params.get("error")) return fail("denied");

  // The user who approved on Epexta must be the one completing the LinkedIn login.
  const user = await getCurrentUser();
  if (!user || user.id !== payload.userId) return fail("session");

  const code = params.get("code");
  if (!code) return fail("error");

  const token = await exchangeCodeForToken(code);
  if (!token.ok) return fail("error");

  returnUrl.searchParams.set(
    "epexta_code",
    createHandoff({ accessToken: token.accessToken, expiresIn: token.expiresIn, scope: token.scope, origin: returnUrl.origin }),
  );
  return NextResponse.redirect(returnUrl);
}
