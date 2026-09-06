export interface WpTerm {
  id: number;
  name: string;
  slug: string;
}

export interface WpMedia {
  id: number;
  source_url: string;
}

export interface CreatePostInput {
  title: string;
  contentHtml: string;
  status: "draft" | "publish" | "pending";
  excerpt?: string;
  categoryNames?: string[];
  tagNames?: string[];
  seoTitle?: string;
  seoDescription?: string;
  slug?: string;
}

export interface WordPressCredentials {
  siteUrl: string;
  username: string;
  appPassword: string;
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
      throw new Error(`WordPress API error ${res.status} on ${path}: ${body}`);
    }

    if (res.status === 204) return null as T;
    return res.json() as Promise<T>;
  }

  async function findOrCreateTerm(taxonomyPath: "categories" | "tags", name: string): Promise<number> {
    const trimmed = name.trim();
    const existing: WpTerm[] = await wpFetch(
      `/wp/v2/${taxonomyPath}?search=${encodeURIComponent(trimmed)}&per_page=100`
    );
    const match = existing.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
    if (match) return match.id;

    const created: WpTerm = await wpFetch(`/wp/v2/${taxonomyPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    return created.id;
  }

  function resolveCategoryIds(names: string[]): Promise<number[]> {
    return Promise.all(names.map((n) => findOrCreateTerm("categories", n)));
  }

  function resolveTagIds(names: string[]): Promise<number[]> {
    return Promise.all(names.map((n) => findOrCreateTerm("tags", n)));
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

  async function createPost(input: CreatePostInput) {
    const [categories, tags] = await Promise.all([
      input.categoryNames?.length ? resolveCategoryIds(input.categoryNames) : Promise.resolve(undefined),
      input.tagNames?.length ? resolveTagIds(input.tagNames) : Promise.resolve(undefined),
    ]);

    const body: Record<string, unknown> = {
      title: input.title,
      content: input.contentHtml,
      status: input.status,
    };
    if (input.excerpt) body.excerpt = input.excerpt;
    if (input.slug) body.slug = input.slug;
    if (categories) body.categories = categories;
    if (tags) body.tags = tags;
    if (input.seoTitle || input.seoDescription) {
      body.meta = {
        ...(input.seoTitle ? { _yoast_wpseo_title: input.seoTitle } : {}),
        ...(input.seoDescription ? { _yoast_wpseo_metadesc: input.seoDescription } : {}),
      };
    }

    return wpFetch(`/wp/v2/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function updatePost(postId: number, fields: Partial<CreatePostInput>) {
    const [categories, tags] = await Promise.all([
      fields.categoryNames?.length ? resolveCategoryIds(fields.categoryNames) : Promise.resolve(undefined),
      fields.tagNames?.length ? resolveTagIds(fields.tagNames) : Promise.resolve(undefined),
    ]);

    const body: Record<string, unknown> = {};
    if (fields.title) body.title = fields.title;
    if (fields.contentHtml) body.content = fields.contentHtml;
    if (fields.status) body.status = fields.status;
    if (fields.excerpt) body.excerpt = fields.excerpt;
    if (fields.slug) body.slug = fields.slug;
    if (categories) body.categories = categories;
    if (tags) body.tags = tags;
    if (fields.seoTitle || fields.seoDescription) {
      body.meta = {
        ...(fields.seoTitle ? { _yoast_wpseo_title: fields.seoTitle } : {}),
        ...(fields.seoDescription ? { _yoast_wpseo_metadesc: fields.seoDescription } : {}),
      };
    }

    return wpFetch(`/wp/v2/posts/${postId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function publishPost(postId: number) {
    return updatePost(postId, { status: "publish" });
  }

  async function uploadMediaBuffer(buffer: Buffer, filename: string, mimeType: string, altText?: string) {
    const media = await wpFetch<WpMedia>(`/wp/v2/media`, {
      method: "POST",
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
      body: new Uint8Array(buffer),
    });

    if (altText) {
      await wpFetch(`/wp/v2/media/${media.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alt_text: altText }),
      });
    }

    return media;
  }

  async function uploadMediaFromUrl(imageUrl: string, filename: string, altText?: string) {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      throw new Error(`Could not fetch image from ${imageUrl}: ${imgRes.status}`);
    }
    const contentType = imgRes.headers.get("content-type") ?? "image/png";
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    return uploadMediaBuffer(buffer, filename, contentType, altText);
  }

  function uploadMediaFromBase64(base64Data: string, filename: string, mimeType: string, altText?: string) {
    const buffer = Buffer.from(base64Data, "base64");
    return uploadMediaBuffer(buffer, filename, mimeType, altText);
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
    listPosts,
    listCategories,
    listTags,
    createPost,
    updatePost,
    publishPost,
    uploadMediaFromUrl,
    uploadMediaFromBase64,
    setFeaturedImage,
  };
}

export type WordPressClient = ReturnType<typeof createWordPressClient>;
