import { NextRequest, NextResponse } from "next/server";
import { MODULES } from "@/lib/modules";
import { getCurrentUser } from "@/lib/session";
import { handleCallback } from "@/modules/google-connections";

// Single shared callback for both Google Site Hub modules - one Google OAuth client
// serves both, and handleCallback resolves which module a given state token belongs
// to. See "Default reporting consent" in GOOGLE_PERFORMANCE_PLAN.md.
function connectPathFor(capability: string | null): string {
  const moduleDefinition = MODULES.find((m) => m.slug === capability);
  return moduleDefinition?.connectPath ?? "/";
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const state = params.get("state");
  const code = params.get("code") ?? undefined;
  const error = params.get("error") ?? undefined;
  const errorDescription = params.get("error_description") ?? undefined;

  if (!state) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const user = await getCurrentUser();

  // Never log the full callback URL/query string (it can carry the authorization
  // code) - only the outcome, below, via the redirect target itself.
  const result = await handleCallback(state, { code, error, error_description: errorDescription }, user?.id ?? null);

  const url = new URL(connectPathFor(result.capability), request.url);

  if (result.status === "connected") {
    url.searchParams.set("connected", result.connectionId);
  } else if (result.status === "denied") {
    url.searchParams.set("googleOauth", "denied");
  } else {
    url.searchParams.set("googleOauth", "error");
  }

  return NextResponse.redirect(url);
}
