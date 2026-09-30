"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { buildAuthorizationUrl, createState, parseReturnUrl } from "./oauth";

// Posted by the consent page (app/(frontend)/linkedin/connect). Re-validates the return
// URL from scratch and requires a signed-in user; Next's Server Action origin check covers CSRF.
export async function continueToLinkedInAction(formData: FormData): Promise<void> {
  const raw = formData.get("return");
  const returnUrl = parseReturnUrl(raw);
  if (!returnUrl) redirect("/linkedin/connect");

  const user = await getCurrentUser();
  if (!user) redirect(`/login?redirectTo=${encodeURIComponent(`/linkedin/connect?return=${encodeURIComponent(returnUrl.toString())}`)}`);

  redirect(buildAuthorizationUrl(createState({ userId: user.id, returnUrl: returnUrl.toString() })));
}
