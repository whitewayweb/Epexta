import sharp from "sharp";
import { yoastAdapter } from "./seo/providers/yoast";
import type { SeoProbeContext, SeoProfile } from "./seo/types";

// Describes a failure from the target WordPress site itself (bad credentials, invalid
// post ID, unreachable image URL, etc.) - safe to relay to a calling LLM verbatim,
// since it only ever contains that site's own response, never our own internals.
export class WordPressApiError extends Error {}

export interface WpTerm {
  id: number;
  name: string;
  slug: string;
}

export interface WpMedia {
  id: number;
  source_url: string;
}

interface WpPostTitle {
  id: number;
  title: {
    raw?: string;
    rendered: string;
  };
}

interface WpPostForPerformance {
  id: number;
  link: string;
  status: string;
  modified: string;
}

export interface PostForPerformance {
  postId: number;
  canonicalLink: string;
  status: string;
  modifiedAt: string;
}

export interface CreatePostInput {
  title: string;
  contentHtml: string;
  status: "draft" | "publish" | "pending";
  excerpt?: string;
  categoryNames?: string[];
  /**
   * Optional overrides for the SEO details of categories created as part of this
   * request. Keys are category names (matched case-insensitively). Existing
   * categories are deliberately left unchanged.
   */
  categorySeo?: Record<string, CategorySeoInput>;
  tagNames?: string[];
  seoTitle?: string;
  seoDescription?: string;
  focusKeyphrase?: string;
  slug?: string;
}

export interface CategorySeoInput {
  description?: string;
  seoTitle?: string;
  seoDescription?: string;
  focusKeyphrase?: string;
}

interface ResolvedCategorySeo {
  description: string;
  seoTitle: string;
  seoDescription: string;
  focusKeyphrase: string;
}

export interface WordPressCredentials {
  siteUrl: string;
  username: string;
  appPassword: string;
}

const JPEG_MIME_TYPE = "image/jpeg";
const LONG_DASH_IN_TEXT = /(?:&(?:mdash|ndash);|&#(?:8211|8212);|&#x(?:2013|2014);|[—–])/gi;

/**
 * Content authored through this MCP uses commas, periods, or parentheses instead
 * of em and en dashes. Restrict the replacement to text nodes so URLs and other
 * HTML attributes are left intact.
 */
function normaliseContentHtml(contentHtml: string): string {
  return contentHtml
    .split(/(<[^>]*>)/g)
    .map((part) => (part.startsWith("<") ? part : part.replace(new RegExp(`\\s*${LONG_DASH_IN_TEXT.source}\\s*`, "gi"), ", ")))
    .join("");
}

function jpegFilename(filename: string) {
  const basename = filename.trim().replace(/\.[^.]+$/, "") || "featured-image";
  return `${basename}.jpg`;
}

/**
 * WordPress images generated through this module are stored as JPEGs regardless
 * of the source format. Flattening preserves transparent-source images against
 * white because JPEG has no alpha channel.
 */
export async function convertToJpeg(image: Buffer) {
  return sharp(image)
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

export function createWordPressClient(credentials: WordPressCredentials) {
  const siteUrl = credentials.siteUrl.replace(/\/+$/, "");
  const authHeader =
    "Basic " + Buffer.from(`${credentials.username}:${credentials.appPassword}`).toString("base64");

  async function wpFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const url = `${siteUrl}/wp-json${path}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: authHeader,
        ...(init.headers ?? {}),
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new WordPressApiError(`WordPress API error ${res.status} on ${path}: ${body}`);
    }

    if (res.status === 204) return null as T;
    return res.json() as Promise<T>;
  }

  function limitDescription(value: string): string {
    return value.length <= 156 ? value : `${value.slice(0, 153).trimEnd()}...`;
  }

  function resolveCategorySeo(name: string, overrides?: CategorySeoInput): ResolvedCategorySeo {
    const focusKeyphrase = overrides?.focusKeyphrase?.trim() || name;
    const seoTitle = overrides?.seoTitle?.trim() || `${focusKeyphrase}: Articles, Guides & Insights`;
    const seoDescription = limitDescription(
      overrides?.seoDescription?.trim() ||
        `Explore ${focusKeyphrase} articles, guides, and practical insights to help you make informed decisions.`
    );
    return {
      focusKeyphrase,
      seoTitle,
      seoDescription,
      description: overrides?.description?.trim() || seoDescription,
    };
  }

  function categorySeoForName(categorySeo: Record<string, CategorySeoInput> | undefined, name: string) {
    return Object.entries(categorySeo ?? {}).find(([categoryName]) => categoryName.trim().toLowerCase() === name.trim().toLowerCase())?.[1];
  }

  interface ResolvedTerm {
    id: number;
    seoWarning?: string;
  }

  async function findOrCreateTerm(
    taxonomyPath: "categories" | "tags",
    name: string,
    categorySeo?: CategorySeoInput
  ): Promise<ResolvedTerm> {
    const trimmed = name.trim();
    const existing: WpTerm[] = await wpFetch(
      `/wp/v2/${taxonomyPath}?search=${encodeURIComponent(trimmed)}&per_page=100`
    );
    const match = existing.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
    if (match) return { id: match.id };

    const categorySeoDetails = taxonomyPath === "categories" ? resolveCategorySeo(trimmed, categorySeo) : undefined;

    const created: WpTerm & { epexta_seo?: ResolvedCategorySeo } = await wpFetch(`/wp/v2/${taxonomyPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: trimmed,
        ...(categorySeoDetails
          ? { description: categorySeoDetails.description, epexta_seo: categorySeoDetails }
          : {}),
      }),
    });
    return {
      id: created.id,
      ...(categorySeoDetails && !created.epexta_seo
        ? {
            seoWarning:
              `Category "${trimmed}" was created with a description, but its Yoast SEO details were not saved. ` +
              "Install the Epexta category SEO REST bridge described in README.md, then use update_category_seo.",
          }
        : {}),
    };
  }

  interface ResolvedTerms {
    ids: number[];
    warnings: string[];
    seoWarnings: string[];
  }

  async function resolveTermIdsSafe(
    taxonomyPath: "categories" | "tags",
    names: string[],
    categorySeo?: Record<string, CategorySeoInput>
  ): Promise<ResolvedTerms> {
    const singular = taxonomyPath === "categories" ? "category" : "tag";
    const results = await Promise.allSettled(
      names.map((name) => findOrCreateTerm(taxonomyPath, name, categorySeoForName(categorySeo, name)))
    );
    const ids: number[] = [];
    const warnings: string[] = [];
    const seoWarnings: string[] = [];
    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        ids.push(result.value.id);
        if (result.value.seoWarning) seoWarnings.push(result.value.seoWarning);
      } else {
        const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
        warnings.push(`Could not create/assign ${singular} "${names[i]}": ${reason}`);
      }
    });
    return { ids, warnings, seoWarnings };
  }

  function resolveCategoryIds(names: string[], categorySeo?: Record<string, CategorySeoInput>): Promise<ResolvedTerms> {
    return resolveTermIdsSafe("categories", names, categorySeo);
  }

  function resolveTagIds(names: string[]): Promise<ResolvedTerms> {
    return resolveTermIdsSafe("tags", names);
  }

  async function updateCategorySeo(categoryId: number, overrides: CategorySeoInput) {
    const existing = await wpFetch<WpTerm>(`/wp/v2/categories/${categoryId}?context=edit`);
    const seo = resolveCategorySeo(existing.name, overrides);
    const updated = await wpFetch<WpTerm & { epexta_seo?: ResolvedCategorySeo }>(`/wp/v2/categories/${categoryId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: seo.description, epexta_seo: seo }),
    });
    const warnings = updated.epexta_seo
      ? []
      : [
          `Category "${existing.name}" was updated with a description, but its Yoast SEO details were not saved. ` +
            "Install the Epexta category SEO REST bridge described in README.md and retry.",
        ];
    return { category: updated, warnings };
  }

  function listPosts(params: { status?: string; perPage?: number; search?: string }) {
    const qs = new URLSearchParams();
    qs.set("status", params.status ?? "any");
    qs.set("per_page", String(params.perPage ?? 10));
    qs.set("_fields", "id,title,status,link,date,categories,tags");
    if (params.search) qs.set("search", params.search);
    return wpFetch(`/wp/v2/posts?${qs.toString()}`);
  }

  function listCategories() {
    return wpFetch(`/wp/v2/categories?per_page=100&_fields=id,name,slug,count`);
  }

  function listTags() {
    return wpFetch(`/wp/v2/tags?per_page=100&_fields=id,name,slug,count`);
  }

  async function getPostTitle(postId: number): Promise<string> {
    const post = await wpFetch<WpPostTitle>(`/wp/v2/posts/${postId}?context=edit&_fields=id,title`);
    return post.title.raw ?? post.title.rendered;
  }

  // Shared read-only resolver used by both Google Site Hub modules (Search Console, GA4)
  // to turn a WordPress postId into the canonical URL those reporting APIs key off of -
  // see "Post-identity resolution" in GOOGLE_PERFORMANCE_PLAN.md. `link` is WordPress's
  // own canonical URL for the post (already what it serves publicly), not something
  // reconstructed from slug/site URL. Grants neither module any write capability.
  async function getPostForPerformance(postId: number): Promise<PostForPerformance> {
    const post = await wpFetch<WpPostForPerformance>(
      `/wp/v2/posts/${postId}?context=edit&_fields=id,link,status,modified`
    );
    return { postId: post.id, canonicalLink: post.link, status: post.status, modifiedAt: post.modified };
  }

  // Read-only evidence for the SEO provider registry (modules/wordpress/seo/registry.ts)
  // to resolve a profile from. Safe to call against every connected site: it only
  // inspects WordPress core's own self-advertised REST index and one sampled post's
  // documented fields, never a plugin list.
  async function probeSeoEvidence(): Promise<SeoProbeContext> {
    try {
      const index = await wpFetch<{ namespaces?: string[]; routes?: Record<string, unknown> }>("/");
      const restIndexNamespaces = index.namespaces ?? [];
      const restIndexRoutes = Object.keys(index.routes ?? {});

      let samplePost: SeoProbeContext["samplePost"];
      try {
        const posts = await wpFetch<Array<{ id: number; yoast_head_json?: unknown }>>(
          "/wp/v2/posts?per_page=1&_fields=id,yoast_head_json"
        );
        if (posts[0]) {
          samplePost = { id: posts[0].id, fields: { yoast_head_json: posts[0].yoast_head_json ?? null } };
        }
      } catch {
        // A sampling miss (e.g. zero posts) just means less evidence, not an unavailable site.
      }

      return { restIndexNamespaces, restIndexRoutes, samplePost, probedAt: new Date().toISOString() };
    } catch (err) {
      return {
        restIndexNamespaces: [],
        restIndexRoutes: [],
        probedAt: new Date().toISOString(),
        probeError: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // A category/tag that fails to resolve (e.g. no permission to create a new term) must
  // never be allowed to fall through silently - if it did, WordPress would just apply its
  // own default category/no tags to the post, which looks indistinguishable from success.
  function assertNoTermWarnings(categoryResult: ResolvedTerms | undefined, tagResult: ResolvedTerms | undefined) {
    const termWarnings = [...(categoryResult?.warnings ?? []), ...(tagResult?.warnings ?? [])];
    if (termWarnings.length > 0) {
      throw new WordPressApiError(termWarnings.join(" "));
    }
  }

  // Only attempts a provider metadata write when the resolved profile confirms that
  // provider - fail-closed per the SEO provider registry plan, rather than guessing at
  // private meta keys for a plugin that was never actually confirmed as active.
  function buildProviderWrite(
    seoProfile: SeoProfile | undefined,
    input: Pick<Partial<CreatePostInput>, "seoTitle" | "seoDescription" | "focusKeyphrase">
  ) {
    if (!seoProfile || seoProfile.state !== "confirmed" || seoProfile.providerId !== "yoast") return null;
    return yoastAdapter.buildWrite!(input, seoProfile.capabilities);
  }

  function verifyProviderWrite(write: ReturnType<typeof buildProviderWrite>, savedPost: { meta?: Record<string, unknown> }): string[] {
    if (!write) return [];
    return yoastAdapter.verifyWrite!(write, savedPost).warnings;
  }

  async function createPost(input: CreatePostInput, seoProfile?: SeoProfile) {
    const [categoryResult, tagResult] = await Promise.all([
      input.categoryNames?.length ? resolveCategoryIds(input.categoryNames, input.categorySeo) : Promise.resolve(undefined),
      input.tagNames?.length ? resolveTagIds(input.tagNames) : Promise.resolve(undefined),
    ]);
    assertNoTermWarnings(categoryResult, tagResult);

    const body: Record<string, unknown> = {
      title: input.title,
      content: normaliseContentHtml(input.contentHtml),
      status: input.status,
    };
    if (input.excerpt) body.excerpt = input.excerpt;
    if (input.slug) body.slug = input.slug;
    if (categoryResult?.ids.length) body.categories = categoryResult.ids;
    if (tagResult?.ids.length) body.tags = tagResult.ids;
    const write = buildProviderWrite(seoProfile, input);
    if (write) body.meta = write.meta;

    const post = await wpFetch<{ id: number; meta?: Record<string, unknown> }>(`/wp/v2/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const warnings: string[] = [];
    warnings.push(...(categoryResult?.seoWarnings ?? []));
    warnings.push(...verifyProviderWrite(write, post));

    return { post, warnings };
  }

  async function updatePost(postId: number, fields: Partial<CreatePostInput>, seoProfile?: SeoProfile) {
    const [categoryResult, tagResult] = await Promise.all([
      fields.categoryNames?.length ? resolveCategoryIds(fields.categoryNames, fields.categorySeo) : Promise.resolve(undefined),
      fields.tagNames?.length ? resolveTagIds(fields.tagNames) : Promise.resolve(undefined),
    ]);
    assertNoTermWarnings(categoryResult, tagResult);

    const body: Record<string, unknown> = {};
    if (fields.title) body.title = fields.title;
    if (fields.contentHtml !== undefined) body.content = normaliseContentHtml(fields.contentHtml);
    if (fields.status) body.status = fields.status;
    if (fields.excerpt) body.excerpt = fields.excerpt;
    if (fields.slug) body.slug = fields.slug;
    if (categoryResult?.ids.length) body.categories = categoryResult.ids;
    if (tagResult?.ids.length) body.tags = tagResult.ids;
    const write = buildProviderWrite(seoProfile, fields);
    if (write) body.meta = write.meta;

    const post = await wpFetch<{ id: number; meta?: Record<string, unknown> }>(`/wp/v2/posts/${postId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const warnings: string[] = [];
    warnings.push(...(categoryResult?.seoWarnings ?? []));
    warnings.push(...verifyProviderWrite(write, post));

    return { post, warnings };
  }

  function publishPost(postId: number) {
    return updatePost(postId, { status: "publish" });
  }

  async function uploadMediaBuffer(buffer: Buffer, filename: string, mimeType: string, postTitle: string) {
    const media = await wpFetch<WpMedia>(`/wp/v2/media`, {
      method: "POST",
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
      body: new Uint8Array(buffer),
    });

    return wpFetch<WpMedia>(`/wp/v2/media/${media.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: postTitle, alt_text: postTitle }),
    });
  }

  async function uploadMediaFromUrl(imageUrl: string, filename: string, postTitle: string) {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      throw new WordPressApiError(`Could not fetch image from ${imageUrl}: ${imgRes.status}`);
    }
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    return uploadMediaBuffer(await convertToJpeg(buffer), jpegFilename(filename), JPEG_MIME_TYPE, postTitle);
  }

  async function uploadMediaFromBase64(
    base64Data: string,
    filename: string,
    _sourceMimeType: string | undefined,
    postTitle: string
  ) {
    const buffer = Buffer.from(base64Data, "base64");
    return uploadMediaBuffer(await convertToJpeg(buffer), jpegFilename(filename), JPEG_MIME_TYPE, postTitle);
  }

  function setFeaturedImage(postId: number, mediaId: number) {
    return wpFetch(`/wp/v2/posts/${postId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ featured_media: mediaId }),
    });
  }

  return {
    resolveCategoryIds,
    resolveTagIds,
    updateCategorySeo,
    listPosts,
    listCategories,
    listTags,
    getPostTitle,
    getPostForPerformance,
    probeSeoEvidence,
    createPost,
    updatePost,
    publishPost,
    uploadMediaFromUrl,
    uploadMediaFromBase64,
    setFeaturedImage,
  };
}

export type WordPressClient = ReturnType<typeof createWordPressClient>;
