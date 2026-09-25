import type dns from "dns";
import { describe, expect, it } from "vitest";
import { fetchPublicJson, isPublicAddress, SafeFetchError } from "./safe-fetch";

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata service
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "::",
    "fe80::1",
    "fd00::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "::ffff:7f00:1",
    "not-an-ip",
  ])("rejects %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(["8.8.8.8", "160.79.104.10", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("accepts %s", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });
});

function lookupReturning(address: string, family: 4 | 6): typeof dns.lookup {
  return ((_hostname: string, _options: unknown, callback: (err: null, addresses: dns.LookupAddress[]) => void) =>
    callback(null, [{ address, family }])) as unknown as typeof dns.lookup;
}

describe("fetchPublicJson", () => {
  const options = { timeoutMs: 1000, maxBytes: 1024 };

  it("refuses non-https URLs and non-default ports before any network activity", async () => {
    await expect(fetchPublicJson(new URL("http://example.com/client.json"), options)).rejects.toBeInstanceOf(SafeFetchError);
    await expect(fetchPublicJson(new URL("https://example.com:8443/client.json"), options)).rejects.toBeInstanceOf(
      SafeFetchError
    );
  });

  it("refuses private IP-literal hosts (which Node connects to without a DNS lookup)", async () => {
    await expect(fetchPublicJson(new URL("https://127.0.0.1/client.json"), options)).rejects.toBeInstanceOf(SafeFetchError);
    await expect(fetchPublicJson(new URL("https://[::1]/client.json"), options)).rejects.toBeInstanceOf(SafeFetchError);
  });

  it("refuses a hostname that resolves to a private address, inside the socket's own lookup", async () => {
    await expect(
      fetchPublicJson(new URL("https://metadata.example.test/client.json"), {
        ...options,
        lookup: lookupReturning("169.254.169.254", 4),
      })
    ).rejects.toThrow(/public address/);
  });
});
