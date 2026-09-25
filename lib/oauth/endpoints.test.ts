import { afterAll, describe, expect, it } from "vitest";
import { getAppUrl } from "@/lib/app-url";
import { oauthEndpoints } from "./endpoints";
import { getMcpResource } from "./resources";
import { createOAuthFixtures, PKCE, REDIRECT_URI } from "./test-fixtures";

// The HTTP layer Claude and ChatGPT actually talk to: parameter parsing, status codes,
// RFC 6749 error bodies, CORS, and no-store - exercised through the same handlers the
// app/ route files export, without a running server. The flows behind them are covered
// in depth by tokens.test.ts and authorize.test.ts.

const fixtures = createOAuthFixtures();
afterAll(() => fixtures.cleanup());

const wordpress = getMcpResource("/api/wordpress/mcp");

function form(path: string, params: Record<string, string>): Request {
  return new Request(`${getAppUrl()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

async function expectError(response: Response, status: number, error: string): Promise<void> {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
  expect((await body(response)).error).toBe(error);
}

describe("discovery", () => {
  it("serves authorization server metadata advertising exactly what's enforced", async () => {
    const metadata = await body(oauthEndpoints.authorizationServerMetadata());
    expect(metadata).toMatchObject({
      issuer: getAppUrl(),
      token_endpoint: `${getAppUrl()}/oauth/token`,
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    });
    expect(metadata).not.toHaveProperty("scopes_supported");
  });

  it("serves protected resource metadata per MCP route, and 404s anything else", async () => {
    const response = oauthEndpoints.protectedResourceMetadata(wordpress.mcpPath);
    expect(await body(response)).toEqual({
      resource: wordpress.url,
      authorization_servers: [getAppUrl()],
      bearer_methods_supported: ["header"],
      resource_name: `Epexta: ${wordpress.name}`,
    });
    await expectError(oauthEndpoints.protectedResourceMetadata("/api/nope/mcp"), 404, "not_found");
    await expectError(oauthEndpoints.protectedResourceMetadata(""), 404, "not_found");
  });

  it("answers CORS preflight", () => {
    const response = oauthEndpoints.preflight();
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
  });
});

describe("POST /oauth/register", () => {
  it("registers a public client", async () => {
    const response = await oauthEndpoints.register(
      new Request(`${getAppUrl()}/oauth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ redirect_uris: [REDIRECT_URI], client_name: "Endpoint test", token_endpoint_auth_method: "client_secret_basic" }),
      })
    );
    expect(response.status).toBe(201);
    const registered = await body(response);
    expect(registered).toMatchObject({ token_endpoint_auth_method: "none", redirect_uris: [REDIRECT_URI] });
    expect(registered).not.toHaveProperty("client_secret");
    fixtures.trackClient(String(registered.client_id));
  });

  it("rejects a non-JSON body and a bad redirect URI", async () => {
    await expectError(
      await oauthEndpoints.register(new Request(`${getAppUrl()}/oauth/register`, { method: "POST", body: "nope" })),
      400,
      "invalid_client_metadata"
    );
    await expectError(
      await oauthEndpoints.register(
        new Request(`${getAppUrl()}/oauth/register`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ redirect_uris: ["http://example.com/cb"] }),
        })
      ),
      400,
      "invalid_redirect_uri"
    );
  });
});

describe("POST /oauth/token", () => {
  async function codeFor(): Promise<{ clientId: string; code: string }> {
    const userId = await fixtures.createUser();
    const organisationId = await fixtures.createOrganisation([{ userId, role: "admin" }]);
    const client = await fixtures.registerClient();
    return { clientId: client.clientId, code: await fixtures.issueCode({ clientId: client.clientId, userId, organisationId }) };
  }

  it("exchanges a code, then refreshes, as form posts", async () => {
    const { clientId, code } = await codeFor();
    const exchanged = await oauthEndpoints.token(
      form("/oauth/token", {
        grant_type: "authorization_code",
        client_id: clientId,
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: PKCE.verifier,
        resource: wordpress.url,
      })
    );
    expect(exchanged.status).toBe(200);
    expect(exchanged.headers.get("cache-control")).toBe("no-store");
    const tokens = await body(exchanged);
    expect(tokens).toMatchObject({ token_type: "Bearer", expires_in: 3600 });

    const refreshed = await oauthEndpoints.token(
      form("/oauth/token", { grant_type: "refresh_token", client_id: clientId, refresh_token: String(tokens.refresh_token) })
    );
    expect(refreshed.status).toBe(200);
    expect((await body(refreshed)).refresh_token).not.toBe(tokens.refresh_token);
  });

  it("maps a replayed code to invalid_grant", async () => {
    const { clientId, code } = await codeFor();
    const params = { grant_type: "authorization_code", client_id: clientId, code, redirect_uri: REDIRECT_URI, code_verifier: PKCE.verifier };
    expect((await oauthEndpoints.token(form("/oauth/token", params))).status).toBe(200);
    await expectError(await oauthEndpoints.token(form("/oauth/token", params)), 400, "invalid_grant");
  });

  it.each([
    ["a JSON body", () => new Request(`${getAppUrl()}/oauth/token`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), "invalid_request"],
    ["a repeated parameter", () => new Request(`${getAppUrl()}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "client_id=a&client_id=b&grant_type=refresh_token" }), "invalid_request"],
    ["no client_id", () => form("/oauth/token", { grant_type: "refresh_token", refresh_token: "x" }), "invalid_request"],
    ["an unsupported grant_type", () => form("/oauth/token", { grant_type: "password", client_id: "x" }), "unsupported_grant_type"],
    ["a code exchange missing code_verifier", () => form("/oauth/token", { grant_type: "authorization_code", client_id: "x", code: "c", redirect_uri: REDIRECT_URI }), "invalid_request"],
    ["a refresh missing refresh_token", () => form("/oauth/token", { grant_type: "refresh_token", client_id: "x" }), "invalid_request"],
    ["an unknown code", () => form("/oauth/token", { grant_type: "authorization_code", client_id: "x", code: "epx_ac_nope", redirect_uri: REDIRECT_URI, code_verifier: PKCE.verifier }), "invalid_grant"],
  ])("rejects %s", async (_label, request, error) => {
    await expectError(await oauthEndpoints.token(request()), 400, error);
  });
});

describe("POST /oauth/revoke", () => {
  it("revokes, answers 200 for unknown tokens, and refuses another client's token", async () => {
    const userId = await fixtures.createUser();
    const organisationId = await fixtures.createOrganisation([{ userId, role: "admin" }]);
    const client = await fixtures.registerClient();
    const otherClient = await fixtures.registerClient();
    const code = await fixtures.issueCode({ clientId: client.clientId, userId, organisationId });
    const tokens = await body(
      await oauthEndpoints.token(
        form("/oauth/token", { grant_type: "authorization_code", client_id: client.clientId, code, redirect_uri: REDIRECT_URI, code_verifier: PKCE.verifier })
      )
    );
    const token = String(tokens.refresh_token);

    await expectError(await oauthEndpoints.revoke(form("/oauth/revoke", { token, client_id: otherClient.clientId })), 400, "unauthorized_client");
    expect((await oauthEndpoints.revoke(form("/oauth/revoke", { token, client_id: client.clientId }))).status).toBe(200);
    expect((await oauthEndpoints.revoke(form("/oauth/revoke", { token: "epx_rt_unknown", client_id: client.clientId }))).status).toBe(200);
    await expectError(await oauthEndpoints.revoke(form("/oauth/revoke", { token })), 400, "invalid_request");

    // The revoked grant's refresh token no longer works.
    await expectError(
      await oauthEndpoints.token(form("/oauth/token", { grant_type: "refresh_token", client_id: client.clientId, refresh_token: token })),
      400,
      "invalid_grant"
    );
  });
});
