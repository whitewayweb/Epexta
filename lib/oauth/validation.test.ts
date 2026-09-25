import { describe, expect, it } from "vitest";
import {
  isAllowedRedirectUri,
  isLoopbackRedirectUri,
  isValidS256Challenge,
  redirectUriMatches,
  verifyPkceS256,
} from "./validation";

describe("redirect URI registration rules", () => {
  it("allows https and http loopback only", () => {
    expect(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(isAllowedRedirectUri("http://127.0.0.1/callback")).toBe(true);
    expect(isAllowedRedirectUri("http://localhost:3000/callback")).toBe(true);
    expect(isAllowedRedirectUri("http://[::1]/callback")).toBe(true);
    expect(isAllowedRedirectUri("http://example.com/callback")).toBe(false);
    expect(isAllowedRedirectUri("javascript:alert(1)")).toBe(false);
    expect(isAllowedRedirectUri("https://example.com/cb#fragment")).toBe(false);
    expect(isAllowedRedirectUri("https://user:pass@example.com/cb")).toBe(false);
    expect(isAllowedRedirectUri("not a url")).toBe(false);
  });

  it("recognises loopback redirect URIs", () => {
    expect(isLoopbackRedirectUri("http://127.0.0.1:51234/callback")).toBe(true);
    expect(isLoopbackRedirectUri("https://127.0.0.1/callback")).toBe(false);
    expect(isLoopbackRedirectUri("http://127.0.0.2/callback")).toBe(false);
  });
});

describe("redirectUriMatches", () => {
  const claude = ["https://claude.ai/api/mcp/auth_callback"];
  const claudeCode = ["http://localhost/callback", "http://127.0.0.1/callback"];

  it("matches https redirect URIs exactly", () => {
    expect(redirectUriMatches(claude, "https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(redirectUriMatches(claude, "https://claude.ai/api/mcp/auth_callback/")).toBe(false);
    expect(redirectUriMatches(claude, "https://claude.ai/api/mcp/auth_callback?x=1")).toBe(false);
    expect(redirectUriMatches(claude, "https://claude.ai:8443/api/mcp/auth_callback")).toBe(false);
    expect(redirectUriMatches(claude, "https://evil.example/api/mcp/auth_callback")).toBe(false);
  });

  it("ignores only the port of a registered loopback redirect (RFC 8252 section 7.3)", () => {
    expect(redirectUriMatches(claudeCode, "http://127.0.0.1:51234/callback")).toBe(true);
    expect(redirectUriMatches(claudeCode, "http://localhost:3118/callback")).toBe(true);
    expect(redirectUriMatches(claudeCode, "http://127.0.0.1:51234/other")).toBe(false);
    expect(redirectUriMatches(claudeCode, "http://127.0.0.1:51234/callback?extra=1")).toBe(false);
    expect(redirectUriMatches(claudeCode, "https://127.0.0.1:51234/callback")).toBe(false);
  });

  it("does not treat localhost and 127.0.0.1 as interchangeable", () => {
    expect(redirectUriMatches(["http://127.0.0.1/callback"], "http://localhost:1234/callback")).toBe(false);
  });

  it("never port-relaxes a non-loopback registration", () => {
    expect(redirectUriMatches(claude, "http://127.0.0.1:1234/api/mcp/auth_callback")).toBe(false);
  });
});


// RFC 7636 Appendix B's worked example.
const RFC_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const RFC_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

describe("PKCE S256", () => {
  it("accepts the RFC 7636 Appendix B verifier/challenge pair", () => {
    expect(isValidS256Challenge(RFC_CHALLENGE)).toBe(true);
    expect(verifyPkceS256(RFC_VERIFIER, RFC_CHALLENGE)).toBe(true);
  });

  it("rejects a wrong verifier", () => {
    expect(verifyPkceS256(`${RFC_VERIFIER.slice(0, -1)}x`, RFC_CHALLENGE)).toBe(false);
  });

  it("rejects the plain method (verifier sent as its own challenge)", () => {
    expect(isValidS256Challenge(RFC_VERIFIER)).toBe(true); // same length/charset...
    expect(verifyPkceS256(RFC_VERIFIER, RFC_VERIFIER)).toBe(false); // ...but never matches as S256
  });

  it("rejects malformed verifiers and challenges", () => {
    expect(verifyPkceS256("too-short", RFC_CHALLENGE)).toBe(false);
    expect(verifyPkceS256(`${RFC_VERIFIER}!`, RFC_CHALLENGE)).toBe(false);
    expect(isValidS256Challenge(`${RFC_CHALLENGE}=`)).toBe(false);
    expect(isValidS256Challenge("")).toBe(false);
  });
});
