import type dns from "dns";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPayloadClient } from "@/lib/payload";
import { isCimdClientId, OAuthClientError, registerDynamicClient, resolveClient } from "./clients";
import { fetchPublicJson } from "./safe-fetch";

vi.mock("./safe-fetch", () => ({ fetchPublicJson: vi.fn() }));
const mockedFetch = vi.mocked(fetchPublicJson);

const createdClientIds: string[] = [];
afterAll(async () => {
  const payload = await getPayloadClient();
  for (const clientId of createdClientIds) {
    await payload
      .delete({ collection: "oauth-clients", where: { clientId: { equals: clientId } }, overrideAccess: true })
      .catch(() => {});
  }
});
beforeEach(() => {
  mockedFetch.mockReset();
});

function uniqueCimdUrl(): string {
  const url = `https://client.example.test/oauth/${crypto.randomUUID()}.json`;
  createdClientIds.push(url);
  return url;
}

describe("Dynamic Client Registration", () => {
  it("registers a public client, overriding any requested confidential auth method", async () => {
    const result = await registerDynamicClient({
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
      client_name: "Claude",
      token_endpoint_auth_method: "client_secret_post",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdClientIds.push(String(result.response.client_id));
    expect(result.response).toMatchObject({ token_endpoint_auth_method: "none", client_name: "Claude" });
    expect(result.response).not.toHaveProperty("client_secret");

    const resolved = await resolveClient(String(result.response.client_id));
    expect(resolved.redirectUris).toEqual(["https://claude.ai/api/mcp/auth_callback"]);
  });

  it("rejects non-https, non-loopback redirect URIs", async () => {
    const result = await registerDynamicClient({ redirect_uris: ["http://evil.example/cb"] });
    expect(result).toMatchObject({ ok: false, error: "invalid_redirect_uri" });
  });

  it("rejects an unknown client_id", async () => {
    await expect(resolveClient("epx_client_nope")).rejects.toBeInstanceOf(OAuthClientError);
    await expect(resolveClient("some-other-id")).rejects.toBeInstanceOf(OAuthClientError);
  });
});

describe("Client ID Metadata Documents", () => {
  it("identifies CIMD client_ids", () => {
    expect(isCimdClientId("https://chatgpt.com/oauth/client.json")).toBe(true);
    expect(isCimdClientId("https://chatgpt.com/")).toBe(false);
    expect(isCimdClientId("http://example.com/client.json")).toBe(false);
    expect(isCimdClientId("epx_client_abc")).toBe(false);
  });

  it("fetches, validates, and caches a metadata document", async () => {
    const clientId = uniqueCimdUrl();
    mockedFetch.mockResolvedValue({
      body: {
        client_id: clientId,
        client_name: "ChatGPT",
        redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
        // ChatGPT's real document declares this while listing "none" as supported - accepted.
        token_endpoint_auth_method: "private_key_jwt",
      },
      maxAgeMs: 60 * 60 * 1000,
    });

    const first = await resolveClient(clientId);
    const second = await resolveClient(clientId);
    expect(first).toMatchObject({ clientName: "ChatGPT", registrationType: "cimd" });
    expect(second.id).toBe(first.id);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects a document whose client_id doesn't match its URL", async () => {
    const clientId = uniqueCimdUrl();
    mockedFetch.mockResolvedValue({
      body: { client_id: "https://attacker.example/client.json", client_name: "Evil", redirect_uris: ["https://a.example/cb"] },
      maxAgeMs: null,
    });
    await expect(resolveClient(clientId)).rejects.toThrow(/does not match/);
  });

  it("rejects a document with disallowed redirect URIs", async () => {
    const clientId = uniqueCimdUrl();
    mockedFetch.mockResolvedValue({
      body: { client_id: clientId, client_name: "Bad", redirect_uris: ["http://attacker.example/cb"] },
      maxAgeMs: null,
    });
    await expect(resolveClient(clientId)).rejects.toBeInstanceOf(OAuthClientError);
  });

  it("reports a document the SSRF guard refuses as a client error", async () => {
    const actual = await vi.importActual<typeof import("./safe-fetch")>("./safe-fetch");
    mockedFetch.mockImplementation(actual.fetchPublicJson);
    // A client_id whose host resolves to the cloud metadata address must never be fetched.
    const privateLookup = ((_host: string, _opts: unknown, callback: (e: null, a: dns.LookupAddress[]) => void) =>
      callback(null, [{ address: "169.254.169.254", family: 4 }])) as unknown as typeof dns.lookup;

    await expect(resolveClient(uniqueCimdUrl(), { lookup: privateLookup })).rejects.toBeInstanceOf(OAuthClientError);
  });
});
