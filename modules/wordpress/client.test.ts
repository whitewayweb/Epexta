import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { createWordPressClient } from "./client";
import type { SeoProfile } from "./seo/types";

const credentials = {
  siteUrl: "https://example.com",
  username: "publisher",
  appPassword: "application-password",
};

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("WordPress category SEO", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("adds Yoast category SEO defaults only when it creates a category", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 12,
          name: "AI Strategy",
          slug: "ai-strategy",
          epexta_seo: {
            focusKeyphrase: "AI Strategy",
            seoTitle: "AI Strategy: Articles, Guides & Insights",
            seoDescription: "Explore AI Strategy articles, guides, and practical insights to help you make informed decisions.",
          },
        })
      )
      .mockResolvedValueOnce(jsonResponse({ id: 99, meta: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await createWordPressClient(credentials).createPost({
      title: "A practical AI strategy",
      contentHtml: "<p>Content</p>",
      status: "draft",
      categoryNames: ["AI Strategy"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const categoryRequest = fetchMock.mock.calls[1];
    expect(categoryRequest[0]).toBe("https://example.com/wp-json/wp/v2/categories");
    expect(JSON.parse(categoryRequest[1].body)).toMatchObject({
      name: "AI Strategy",
      description: "Explore AI Strategy articles, guides, and practical insights to help you make informed decisions.",
      epexta_seo: {
        focusKeyphrase: "AI Strategy",
        seoTitle: "AI Strategy: Articles, Guides & Insights",
      },
    });
  });

  it("warns when the category SEO bridge does not confirm a newly created category's Yoast fields", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ id: 12, name: "AI Strategy", slug: "ai-strategy" }))
      .mockResolvedValueOnce(jsonResponse({ id: 99, meta: {} }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createWordPressClient(credentials).createPost({
      title: "A practical AI strategy",
      contentHtml: "<p>Content</p>",
      status: "draft",
      categoryNames: ["AI Strategy"],
    });

    expect(result.warnings).toContainEqual(expect.stringContaining("Yoast SEO details were not saved"));
  });

  it("updates an existing category through the same category SEO bridge", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: 12, name: "AI Strategy", slug: "ai-strategy" }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 12,
          name: "AI Strategy",
          slug: "ai-strategy",
          epexta_seo: { focusKeyphrase: "AI planning", seoTitle: "AI planning: a practical guide" },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createWordPressClient(credentials).updateCategorySeo(12, {
      focusKeyphrase: "AI planning",
      seoTitle: "AI planning: a practical guide",
    });

    expect(result.warnings).toEqual([]);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      epexta_seo: { focusKeyphrase: "AI planning", seoTitle: "AI planning: a practical guide" },
    });
  });
});

function seoProfile(overrides: Partial<SeoProfile> = {}): SeoProfile {
  return {
    providerId: null,
    displayName: "Unknown",
    state: "unknown",
    capabilities: { metadataWrite: "unknown", categoryWrite: "unknown" },
    generationGuidance: [],
    evidence: [],
    observedAt: null,
    error: null,
    ...overrides,
  };
}

describe("WordPress SEO metadata write gating", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does not attach meta when no SEO profile is passed", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ id: 99, meta: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await createWordPressClient(credentials).createPost({
      title: "A post",
      contentHtml: "<p>Content</p>",
      status: "draft",
      seoTitle: "An SEO title",
      focusKeyphrase: "widgets",
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.meta).toBeUndefined();
  });

  it("does not attach meta when the profile state is not confirmed", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ id: 99, meta: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await createWordPressClient(credentials).createPost(
      { title: "A post", contentHtml: "<p>Content</p>", status: "draft", seoTitle: "An SEO title" },
      seoProfile({ state: "unavailable" })
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.meta).toBeUndefined();
  });

  it("attaches and verifies Yoast meta when the profile confirms Yoast", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({ id: 99, meta: { _yoast_wpseo_title: "An SEO title" } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createWordPressClient(credentials).createPost(
      { title: "A post", contentHtml: "<p>Content</p>", status: "draft", seoTitle: "An SEO title" },
      seoProfile({ state: "confirmed", providerId: "yoast" })
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.meta).toEqual({ _yoast_wpseo_title: "An SEO title" });
    expect(result.warnings).toEqual([]);
  });

  it("warns when confirmed Yoast meta does not round-trip", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ id: 99, meta: {} }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createWordPressClient(credentials).createPost(
      { title: "A post", contentHtml: "<p>Content</p>", status: "draft", seoTitle: "An SEO title" },
      seoProfile({ state: "confirmed", providerId: "yoast" })
    );

    expect(result.warnings).toContainEqual(expect.stringContaining("_yoast_wpseo_title"));
  });
});

describe("WordPress media uploads", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("converts source images to JPEG before uploading", async () => {
    const sourcePng = await sharp({
      create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(sourcePng, { headers: { "Content-Type": "image/png" } }))
      .mockResolvedValueOnce(jsonResponse({ id: 55, source_url: "https://example.com/image.jpg" }))
      .mockResolvedValueOnce(jsonResponse({ id: 55, source_url: "https://example.com/image.jpg" }));
    vi.stubGlobal("fetch", fetchMock);

    await createWordPressClient(credentials).uploadMediaFromUrl(
      "https://images.example/generated.png",
      "featured-image.png",
      "A post title"
    );

    const uploadRequest = fetchMock.mock.calls[1];
    expect(uploadRequest[0]).toBe("https://example.com/wp-json/wp/v2/media");
    expect(uploadRequest[1].headers).toMatchObject({
      "Content-Type": "image/jpeg",
      "Content-Disposition": 'attachment; filename="featured-image.jpg"',
    });
    expect(Buffer.from(uploadRequest[1].body).subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  });
});
