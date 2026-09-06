const SITE_URL = process.env.WP_SITE_URL?.replace(/\/+$/, "");
const USERNAME = process.env.WP_USERNAME;
const APP_PASSWORD = process.env.WP_APP_PASSWORD;

function authHeader(): string {
  if (!SITE_URL || !USERNAME || !APP_PASSWORD) {
    throw new Error(
      "Missing WP_SITE_URL, WP_USERNAME, or WP_APP_PASSWORD environment variables."
    );
  }
  return "Basic " + Buffer.from(`${USERNAME}:${APP_PASSWORD}`).toString("base64");
}

async function wpFetch<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const url = `${SITE_URL}/wp-json${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: authHeader(),
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

export interface WpTerm {
  id: number;
  name: string;
  slug: string;
}

export interface WpMedia {
  id: number;
  source_url: string;
}

async function findOrCreateTerm(
  taxonomyPath: "categories" | "tags",
  name: string
): Promise<number> {
  const trimmed = name.trim();
  const existing: WpTerm[] = await wpFetch(
    `/wp/v2/${taxonomyPath}?search=${encodeURIComponent(trimmed)}&per_page=100`
  );
  const match = existing.find(
    (t) => t.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (match) return match.id;

  const created: WpTerm = await wpFetch(`/wp/v2/${taxonomyPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: trimmed }),
  });
  return created.id;
}

export async function resolveCategoryIds(names: string[]): Promise<number[]> {
  return Promise.all(names.map((n) => findOrCreateTerm("categories", n)));
}

export async function resolveTagIds(names: string[]): Promise<number[]> {
  return Promise.all(names.map((n) => findOrCreateTerm("tags", n)));
}

export async function listPosts(params: {
  status?: string;
  perPage?: number;
  search?: string;
}) {
  const qs = new URLSearchParams();
  qs.set("status", params.status ?? "any");
  qs.set("per_page", String(params.perPage ?? 10));
  qs.set("_fields", "id,title,status,link,date,categories,tags");
  if (params.search) qs.set("search", params.search);
  return wpFetch(`/wp/v2/posts?${qs.toString()}`);
}

export async function listCategories() {
  return wpFetch(`/wp/v2/categories?per_page=100&_fields=id,name,slug,count`);
}

export async function listTags() {
  return wpFetch(`/wp/v2/tags?per_page=100&_fields=id,name,slug,count`);
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

export async function createPost(input: CreatePostInput) {
  const [categories, tags] = await Promise.all([
    input.categoryNames?.length
      ? resolveCategoryIds(input.categoryNames)
      : Promise.resolve(undefined),
    input.tagNames?.length
      ? resolveTagIds(input.tagNames)
      : Promise.resolve(undefined),
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
      ...(input.seoDescription
        ? { _yoast_wpseo_metadesc: input.seoDescription }
        : {}),
    };
  }

  return wpFetch(`/wp/v2/posts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updatePost(
  postId: number,
  fields: Partial<CreatePostInput>
) {
  const [categories, tags] = await Promise.all([
    fields.categoryNames?.length
      ? resolveCategoryIds(fields.categoryNames)
      : Promise.resolve(undefined),
    fields.tagNames?.length
      ? resolveTagIds(fields.tagNames)
      : Promise.resolve(undefined),
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
      ...(fields.seoDescription
        ? { _yoast_wpseo_metadesc: fields.seoDescription }
        : {}),
    };
  }

  return wpFetch(`/wp/v2/posts/${postId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function publishPost(postId: number) {
  return updatePost(postId, { status: "publish" });
}

export async function uploadMediaFromUrl(
  imageUrl: string,
  filename: string,
  altText?: string
) {
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    throw new Error(`Could not fetch image from ${imageUrl}: ${imgRes.status}`);
  }
  const contentType = imgRes.headers.get("content-type") ?? "image/png";
  const buffer = Buffer.from(await imgRes.arrayBuffer());
  return uploadMediaBuffer(buffer, filename, contentType, altText);
}

export async function uploadMediaFromBase64(
  base64Data: string,
  filename: string,
  mimeType: string,
  altText?: string
) {
  const buffer = Buffer.from(base64Data, "base64");
  return uploadMediaBuffer(buffer, filename, mimeType, altText);
}

async function uploadMediaBuffer(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  altText?: string
) {
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

export async function setFeaturedImage(postId: number, mediaId: number) {
  return wpFetch(`/wp/v2/posts/${postId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ featured_media: mediaId }),
  });
}
