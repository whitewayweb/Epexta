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

  it("only evaluates H2 and H3 subheadings", () => {
    const withoutHeadings = yoastAdapter.checks({ focusKeyphrase: "widgets", contentHtml: "<p>widgets</p>" }, capabilities);
    expect(withoutHeadings.some((c) => c.id === "yoast:keyphrase-in-subheading")).toBe(false);

    const h4Only = yoastAdapter.checks(
      { focusKeyphrase: "widgets", contentHtml: "<h4>Widgets</h4><p>widgets</p>" },
      capabilities
    );
    expect(h4Only.some((c) => c.id === "yoast:keyphrase-in-subheading")).toBe(false);
  });

  it("requires the keyphrase in 30-75% of H2/H3 subheadings", () => {
    const tooFew = yoastAdapter.checks(
      {
        focusKeyphrase: "widgets",
        contentHtml: "<h2>Widgets overview</h2><h2>Choosing a supplier</h2><h3>Pricing</h3><h2>Support</h2>",
      },
      capabilities
    );
    const tooFewCheck = tooFew.find((c) => c.id === "yoast:keyphrase-in-subheading");
    expect(tooFewCheck).toMatchObject({ status: "bad", message: expect.stringContaining("1 of 4") });

    const inRange = yoastAdapter.checks(
      {
        focusKeyphrase: "widgets",
        contentHtml: "<h2>Widgets overview</h2><h2>Choosing widgets</h2><h3>Pricing</h3><h2>Support</h2>",
      },
      capabilities
    );
    expect(inRange.find((c) => c.id === "yoast:keyphrase-in-subheading")).toMatchObject({ status: "good" });

    const tooMany = yoastAdapter.checks(
      {
        focusKeyphrase: "widgets",
        contentHtml: "<h2>Widgets overview</h2><h2>Choosing widgets</h2><h3>Widgets pricing</h3><h2>Widgets support</h2>",
      },
      capabilities
    );
    expect(tooMany.find((c) => c.id === "yoast:keyphrase-in-subheading")).toMatchObject({ status: "ok" });
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
