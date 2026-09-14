import { afterEach, describe, expect, it, vi } from "vitest";
import { createWordPressClient } from "./client";

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
