import { describe, expect, it } from "vitest";
import { resolveSeoProfile } from "./registry";
import type { SeoProbeContext } from "./types";

function context(overrides: Partial<SeoProbeContext> = {}): SeoProbeContext {
  return { restIndexNamespaces: [], restIndexRoutes: [], probedAt: "2026-01-01T00:00:00.000Z", ...overrides };
}

describe("resolveSeoProfile", () => {
  it("reports unavailable when the probe itself failed", () => {
    const profile = resolveSeoProfile(context({ probeError: "network error" }), "auto");
    expect(profile.state).toBe("unavailable");
    expect(profile.providerId).toBeNull();
    expect(profile.error).toBe("network error");
  });

  it("reports unknown with no evidence when nothing was detected", () => {
    const profile = resolveSeoProfile(context(), "auto");
    expect(profile.state).toBe("unknown");
    expect(profile.providerId).toBeNull();
    expect(profile.evidence).toEqual([]);
  });

  it("reports unknown but records candidate evidence when only the namespace is present", () => {
    const profile = resolveSeoProfile(context({ restIndexNamespaces: ["yoast/v1"] }), "auto");
    expect(profile.state).toBe("unknown");
    expect(profile.evidence).toContainEqual({ kind: "route", id: "route:yoast/v1" });
  });

  it("confirms Yoast when the sampled post exposes yoast_head_json", () => {
    const profile = resolveSeoProfile(
      context({
        restIndexNamespaces: ["yoast/v1"],
        samplePost: { id: 1, fields: { yoast_head_json: { title: "x" } } },
      }),
      "auto"
    );
    expect(profile.state).toBe("confirmed");
    expect(profile.providerId).toBe("yoast");
    expect(profile.displayName).toBe("Yoast SEO");
    expect(profile.evidence).toContainEqual({ kind: "post-field", id: "post-field:yoast_head_json" });
    expect(profile.generationGuidance.length).toBeGreaterThan(0);
  });

  it("does not confirm when the sampled post's yoast_head_json is null", () => {
    const profile = resolveSeoProfile(
      context({
        restIndexNamespaces: ["yoast/v1"],
        samplePost: { id: 1, fields: { yoast_head_json: null } },
      }),
      "auto"
    );
    expect(profile.state).toBe("unknown");
  });
});
