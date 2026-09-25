import { afterAll, describe, expect, it } from "vitest";
import { getAppUrl } from "@/lib/app-url";
import { approveAuthorization, denyAuthorization, startAuthorization, validateAuthorizationRequest } from "./authorize";
import { getMcpResource } from "./resources";
import { createOAuthFixtures, PKCE, REDIRECT_URI } from "./test-fixtures";

const fixtures = createOAuthFixtures();
afterAll(() => fixtures.cleanup());

async function validRequestParams(): Promise<Record<string, string>> {
  const client = await fixtures.registerClient();
  return {
    client_id: client.clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    code_challenge: PKCE.challenge,
    code_challenge_method: "S256",
    resource: getMcpResource("/api/wordpress/mcp").url,
    state: "abc123",
  };
}

describe("validateAuthorizationRequest", () => {
  it("accepts a well-formed request", async () => {
    const result = await validateAuthorizationRequest(new URLSearchParams(await validRequestParams()));
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.request.resource.mcpPath).toBe("/api/wordpress/mcp");
      expect(result.request.state).toBe("abc123");
    }
  });

  it("never redirects before the client and redirect_uri are verified", async () => {
    const params = await validRequestParams();
    for (const query of [
      { ...params, client_id: "epx_client_does-not-exist" },
      { ...params, redirect_uri: "https://attacker.example/steal" },
      { ...params, client_id: "" },
    ]) {
      const result = await validateAuthorizationRequest(new URLSearchParams(query));
      expect(result.kind).toBe("invalid");
    }
  });

  it("rejects a repeated parameter", async () => {
    const query = new URLSearchParams(await validRequestParams());
    query.append("redirect_uri", "https://attacker.example/steal");
    expect((await validateAuthorizationRequest(query)).kind).toBe("invalid");
  });

  it.each([
    ["missing PKCE", { code_challenge: "" }, "invalid_request"],
    ["plain PKCE", { code_challenge_method: "plain" }, "invalid_request"],
    ["wrong response_type", { response_type: "token" }, "unsupported_response_type"],
    ["unknown resource", { resource: "https://elsewhere.example/mcp" }, "invalid_target"],
    ["missing resource", { resource: "" }, "invalid_target"],
  ])("sends %s back to the verified client with error, state, and iss", async (_label, override, error) => {
    const result = await validateAuthorizationRequest(new URLSearchParams({ ...(await validRequestParams()), ...override }));
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    const url = new URL(result.url);
    expect(`${url.origin}${url.pathname}`).toBe(REDIRECT_URI);
    expect(url.searchParams.get("error")).toBe(error);
    expect(url.searchParams.get("state")).toBe("abc123");
    expect(url.searchParams.get("iss")).toBe(getAppUrl());
  });
});

describe("consent", () => {
  it("describes a valid request for the consent page", async () => {
    const params = await validRequestParams();
    const start = await startAuthorization(params);
    expect(start.kind).toBe("consent");
    if (start.kind !== "consent") return;
    expect(start.consent).toMatchObject({
      clientName: "Test client",
      publisherHost: null,
      runsLocally: false,
      redirectHost: new URL(REDIRECT_URI).host,
    });
    expect(start.consent.resource.mcpPath).toBe("/api/wordpress/mcp");
    expect(new URLSearchParams(start.consent.query).get("state")).toBe("abc123");
  });

  it("keeps a repeated page parameter repeated so it is rejected", async () => {
    const params = await validRequestParams();
    const start = await startAuthorization({ ...params, redirect_uri: [REDIRECT_URI, "https://attacker.example/steal"] });
    expect(start.kind).toBe("invalid");
  });

  it("sends a denial back with access_denied, state, and iss", async () => {
    const url = new URL(await denyAuthorization(new URLSearchParams(await validRequestParams()).toString()));
    expect(url.searchParams.get("error")).toBe("access_denied");
    expect(url.searchParams.get("state")).toBe("abc123");
    expect(url.searchParams.get("iss")).toBe(getAppUrl());
  });

  it("sends an approval for a no-longer-valid request back to the consent page, not the client", async () => {
    const query = new URLSearchParams({ ...(await validRequestParams()), redirect_uri: "https://attacker.example/steal" });
    const target = await approveAuthorization(query.toString(), { userId: "1", organisationId: "1" });
    expect(target.startsWith("/oauth/authorize?")).toBe(true);
  });
});
