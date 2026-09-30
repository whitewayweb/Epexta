import { randomBytes } from "crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createHandoff, createState, parseReturnUrl, readHandoff, readState } from "./oauth";

beforeAll(() => {
  process.env.ENCRYPTION_KEY ||= randomBytes(32).toString("hex");
});

describe("parseReturnUrl", () => {
  it("accepts https sites and http local development hosts only", () => {
    expect(parseReturnUrl("https://example.com/wp-admin/admin.php?page=x")?.host).toBe("example.com");
    expect(parseReturnUrl("http://localhost:8080/wp-admin/")?.host).toBe("localhost:8080");
    expect(parseReturnUrl("http://mysite.test/wp-admin/")).not.toBeNull();
    expect(parseReturnUrl("http://example.com/")).toBeNull();
    expect(parseReturnUrl("javascript:alert(1)")).toBeNull();
    expect(parseReturnUrl("https://user:pw@example.com/")).toBeNull();
    expect(parseReturnUrl(undefined)).toBeNull();
  });
});

describe("sealed state and handoff", () => {
  it("round-trips and keeps the two purposes separate", () => {
    const state = createState({ userId: "1", returnUrl: "https://example.com/" });
    expect(readState(state)).toMatchObject({ userId: "1", returnUrl: "https://example.com/" });
    expect(readHandoff(state)).toBeNull();

    const handoff = createHandoff({ accessToken: "t", expiresIn: 10, scope: "s", origin: "https://example.com" });
    expect(readHandoff(handoff)).toMatchObject({ accessToken: "t", origin: "https://example.com" });
    expect(readState(handoff)).toBeNull();
  });

  it("rejects tampered values", () => {
    expect(readState("not-a-real-value")).toBeNull();
    expect(readHandoff("a.b.c")).toBeNull();
  });
});
