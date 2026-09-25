"use server";

import { redirect } from "next/navigation";
import { getUserOrganisation } from "@/lib/organisation";
import { getCurrentUser } from "@/lib/session";
import { authorizePathForQuery } from "./authorize";
import { oauthProvider } from "./provider";

// Consent-screen and Connected-apps actions. The consent forms post only the original
// authorization query; oauthProvider re-validates it from scratch. Next's Server Action
// origin check covers CSRF.

function postedQuery(formData: FormData): string {
  const raw = formData.get("query");
  return typeof raw === "string" ? raw : "";
}

export async function approveAuthorizationAction(formData: FormData): Promise<void> {
  const query = postedQuery(formData);
  const authorizePath = authorizePathForQuery(query);

  const user = await getCurrentUser();
  if (!user) redirect(`/login?redirectTo=${encodeURIComponent(authorizePath)}`);
  // The page renders the "finish setting up" state for a user without an organisation.
  const organisation = await getUserOrganisation(user.id);
  if (!organisation) redirect(authorizePath);

  const grantor = { userId: user.id, organisationId: organisation.organisationId };
  redirect(await oauthProvider.approveAuthorization(query, grantor));
}

export async function denyAuthorizationAction(formData: FormData): Promise<void> {
  redirect(await oauthProvider.denyAuthorization(postedQuery(formData)));
}

export interface DisconnectAppState {
  error: string | null;
  success: boolean;
}

/**
 * Disconnects one row of a Connected apps table: the user's own (`scope` "own"), or - for
 * an organisation admin - any member's (`scope` "organisation"). The organisation is the
 * caller's own, never one named by the form; oauthProvider re-checks the admin role.
 */
export async function disconnectAppAction(_prevState: DisconnectAppState, formData: FormData): Promise<DisconnectAppState> {
  const user = await getCurrentUser();
  if (!user) return { error: "You must be logged in.", success: false };

  const connectionId = formData.get("connectionId");
  if (typeof connectionId !== "string" || !connectionId) return { error: "Missing app.", success: false };

  let disconnected: boolean;
  if (formData.get("scope") === "organisation") {
    const organisation = await getUserOrganisation(user.id);
    disconnected = organisation
      ? await oauthProvider.disconnectOrganisationApp(user.id, organisation.organisationId, connectionId)
      : false;
  } else {
    disconnected = await oauthProvider.disconnectApp(user.id, connectionId);
  }
  return disconnected ? { error: null, success: true } : { error: "That app connection wasn't found.", success: false };
}
