import { describe, expect, it } from "vitest";
import { yoastAdapter } from "./yoast";
import type { SeoCapabilities } from "../types";

const capabilities: SeoCapabilities = { metadataWrite: "unknown", categoryWrite: "unknown" };

describe("yoastAdapter.buildWrite / verifyWrite", () => {
  it("returns null when no SEO fields are set", () => {
    expect(yoastAdapter.buildWrite!({}, capabilities)).toBeNull();
  });

  it("builds the Yoast meta keys only for fields that were provided", () => {
    const write = yoastAdapter.buildWrite!({ seoTitle: "Title", focusKeyphrase: "phrase" }, capabilities);
    expect(write).toEqual({
      meta: { _yoast_wpseo_title: "Title", _yoast_wpseo_focuskw: "phrase" },
      fields: ["_yoast_wpseo_title", "_yoast_wpseo_focuskw"],
    });
  });

  it("reports saved when every requested key round-trips", () => {
    const write = yoastAdapter.buildWrite!({ seoTitle: "Title" }, capabilities)!;
    const result = yoastAdapter.verifyWrite!(write, { meta: { _yoast_wpseo_title: "Title" } });
    expect(result).toEqual({ state: "saved", warnings: [] });
  });

  it("reports rejected with a warning when a key did not persist", () => {
    const write = yoastAdapter.buildWrite!({ seoTitle: "Title" }, capabilities)!;
    const result = yoastAdapter.verifyWrite!(write, { meta: {} });
    expect(result.state).toBe("rejected");
    expect(result.warnings).toContainEqual(expect.stringContaining("_yoast_wpseo_title"));
  });
});

describe("yoastAdapter.checks", () => {
  it("returns a single bad check when no focus keyphrase is set", () => {
    const checks = yoastAdapter.checks({}, capabilities);
    expect(checks).toEqual([
      { id: "yoast:focus-keyphrase", status: "bad", message: expect.any(String), alignment: "provider-aligned" },
    ]);
  });

  it("flags a missing keyphrase in the title", () => {
    const checks = yoastAdapter.checks({ focusKeyphrase: "widgets", title: "About our company" }, capabilities);
    const titleCheck = checks.find((c) => c.id === "yoast:keyphrase-in-title");
    expect(titleCheck?.status).toBe("bad");
  });

  it("passes when the keyphrase appears in the title", () => {
    const checks = yoastAdapter.checks({ focusKeyphrase: "widgets", title: "Best widgets for 2026" }, capabilities);
    const titleCheck = checks.find((c) => c.id === "yoast:keyphrase-in-title");
    expect(titleCheck?.status).toBe("good");
  });

  it("scores SEO title length within Yoast's 40-60 char band as good", () => {
    const seoTitle = "A".repeat(45);
    const checks = yoastAdapter.checks({ focusKeyphrase: "widgets", seoTitle }, capabilities);
    const lengthCheck = checks.find((c) => c.id === "yoast:seo-title-length");
    expect(lengthCheck?.status).toBe("good");
  });

  it("scores SEO title length outside the 40-60 char band as ok, not bad", () => {
    const seoTitle = "Short";
    const checks = yoastAdapter.checks({ focusKeyphrase: "widgets", seoTitle }, capabilities);
    const lengthCheck = checks.find((c) => c.id === "yoast:seo-title-length");
    expect(lengthCheck?.status).toBe("ok");
  });

  it("flags a subheading check only when headings are present in content", () => {
    const withoutHeadings = yoastAdapter.checks({ focusKeyphrase: "widgets", contentHtml: "<p>widgets</p>" }, capabilities);
    expect(withoutHeadings.some((c) => c.id === "yoast:keyphrase-in-subheading")).toBe(false);

    const withHeadings = yoastAdapter.checks(
      { focusKeyphrase: "widgets", contentHtml: "<h2>Intro</h2><p>widgets</p>" },
      capabilities
    );
    expect(withHeadings.some((c) => c.id === "yoast:keyphrase-in-subheading")).toBe(true);
  });
});

describe("yoastAdapter.detect", () => {
  it("returns null when there is no evidence at all", () => {
    expect(yoastAdapter.detect({ restIndexNamespaces: [], restIndexRoutes: [], probedAt: "now" })).toBeNull();
  });

  it("returns a confirmed detection when the sample post exposes yoast_head_json", () => {
    const detection = yoastAdapter.detect({
      restIndexNamespaces: ["yoast/v1"],
      restIndexRoutes: [],
      samplePost: { id: 1, fields: { yoast_head_json: {} } },
      probedAt: "now",
    });
    expect(detection?.confidence).toBe("confirmed");
    expect(detection?.providerId).toBe("yoast");
  });
});
