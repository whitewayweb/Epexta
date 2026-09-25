import { randomUUID } from "crypto";
import { getPayloadClient } from "@/lib/payload";
import { approveAuthorization } from "./authorize";
import { registerDynamicClient } from "./clients";
import { getMcpResource, type McpPath } from "./resources";

// Shared setup for the OAuth integration tests (real database, like the rest of the
// suite). Everything created here is removed by cleanup(): deleting the organisations and
// users cascades to their codes, grants, and tokens (see the OAuth migration's FKs), after
// which the clients no grant references can be deleted too.

/** RFC 7636 Appendix B's verifier/challenge pair. */
export const PKCE = {
  verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
  challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
};
export const REDIRECT_URI = "https://client.example.test/callback";

export function createOAuthFixtures() {
  const userIds: string[] = [];
  const organisationIds: string[] = [];
  const clientIds: string[] = [];

  async function createUser(): Promise<string> {
    const payload = await getPayloadClient();
    const user = await payload.create({
      collection: "users",
      data: { email: `oauth-test-${randomUUID()}@example.com`, password: "test-password-123", role: "customer" },
    });
    userIds.push(String(user.id));
    return String(user.id);
  }

  async function createOrganisation(members: { userId: string; role: "admin" | "member" }[]): Promise<string> {
    const payload = await getPayloadClient();
    const org = await payload.create({
      collection: "organisations",
      data: { name: `oauth-test-org-${randomUUID()}`, members: members.map((m) => ({ user: Number(m.userId), role: m.role })) },
      overrideAccess: true,
    });
    organisationIds.push(String(org.id));
    return String(org.id);
  }

  async function registerClient(redirectUris = [REDIRECT_URI]): Promise<{ clientId: string; docId: string }> {
    const result = await registerDynamicClient({ redirect_uris: redirectUris, client_name: "Test client" });
    if (!result.ok) throw new Error(result.description);
    const clientId = String(result.response.client_id);
    const payload = await getPayloadClient();
    const found = await payload.find({
      collection: "oauth-clients",
      where: { clientId: { equals: clientId } },
      limit: 1,
      overrideAccess: true,
    });
    clientIds.push(clientId);
    return { clientId, docId: String(found.docs[0].id) };
  }

  /** Issues a code the way the consent page does - approving a valid authorization request. */
  async function issueCode(input: {
    clientId: string;
    userId: string;
    organisationId: string;
    mcpPath?: McpPath;
  }): Promise<string> {
    const query = new URLSearchParams({
      client_id: input.clientId,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      code_challenge: PKCE.challenge,
      code_challenge_method: "S256",
      resource: getMcpResource(input.mcpPath ?? "/api/wordpress/mcp").url,
    });
    const redirectTo = new URL(
      await approveAuthorization(query.toString(), { userId: input.userId, organisationId: input.organisationId })
    );
    const code = redirectTo.searchParams.get("code");
    if (!code) throw new Error(`Approval did not issue a code: ${redirectTo}`);
    return code;
  }

  /** Registers a client created some other way (e.g. through the /oauth/register endpoint) for cleanup. */
  function trackClient(clientId: string): void {
    clientIds.push(clientId);
  }

  async function cleanup(): Promise<void> {
    const payload = await getPayloadClient();
    for (const id of organisationIds) {
      await payload.delete({ collection: "organisations", id, overrideAccess: true }).catch(() => {});
    }
    for (const id of userIds) {
      await payload.delete({ collection: "users", id, overrideAccess: true }).catch(() => {});
    }
    for (const clientId of clientIds) {
      await payload
        .delete({ collection: "oauth-clients", where: { clientId: { equals: clientId } }, overrideAccess: true })
        .catch(() => {});
    }
  }

  return { createUser, createOrganisation, registerClient, trackClient, issueCode, cleanup };
}
