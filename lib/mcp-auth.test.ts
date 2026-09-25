import { randomBytes } from "crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createApiKey } from "./api-keys";
import { authenticateMcpBearer } from "./mcp-auth";
import { createOAuthFixtures, PKCE, REDIRECT_URI } from "./oauth/test-fixtures";
import { exchangeAuthorizationCode } from "./oauth/tokens";

const fixtures = createOAuthFixtures();
afterAll(() => fixtures.cleanup());

describe("authenticateMcpBearer", () => {
  it("accepts an API key, acting for the user's organisation", async () => {
    const userId = await fixtures.createUser();
    const organisationId = await fixtures.createOrganisation([{ userId, role: "admin" }]);
    const rawKey = randomBytes(32).toString("hex");
    await createApiKey(userId, "test key", rawKey);

    for (const path of ["/api/wordpress/mcp", "/api/google/mcp"] as const) {
      expect(await authenticateMcpBearer(rawKey, path)).toEqual({ userId, organisationId, via: "api-key" });
    }
  });

  it("accepts an OAuth access token only on the route it was issued for", async () => {
    const userId = await fixtures.createUser();
    const organisationId = await fixtures.createOrganisation([{ userId, role: "admin" }]);
    const client = await fixtures.registerClient();
    const code = await fixtures.issueCode({ clientId: client.clientId, userId, organisationId, mcpPath: "/api/google/mcp" });
    const tokens = await exchangeAuthorizationCode({
      code,
      clientId: client.clientId,
      redirectUri: REDIRECT_URI,
      codeVerifier: PKCE.verifier,
    });

    expect(await authenticateMcpBearer(tokens.access_token, "/api/google/mcp")).toMatchObject({
      userId,
      organisationId,
      via: "oauth",
      oauthClientId: client.clientId,
    });
    expect(await authenticateMcpBearer(tokens.access_token, "/api/wordpress/mcp")).toBeNull();
    // A refresh token is never a valid bearer credential.
    expect(await authenticateMcpBearer(tokens.refresh_token, "/api/google/mcp")).toBeNull();
  });

  it("rejects unknown tokens", async () => {
    expect(await authenticateMcpBearer("epx_at_not-a-real-token", "/api/wordpress/mcp")).toBeNull();
    expect(await authenticateMcpBearer("deadbeef", "/api/wordpress/mcp")).toBeNull();
  });
});
