import type { SeoCheck, SeoCheckInput, SeoGuidance } from "../types";

export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function firstParagraphText(html: string): string {
  const match = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  return stripHtml(match ? match[1] : html.slice(0, 400));
}

export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escaped, "gi");
  return (haystack.match(re) ?? []).length;
}

export function includesCi(haystack: string | undefined, needle: string): boolean {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Checks useful regardless of which SEO plugin (if any) is active: content length,
 * links, and image presence. Always run, unlike provider-aligned checks which only
 * run once a provider is confirmed.
 */
export function runNeutralChecks(input: SeoCheckInput): SeoCheck[] {
  const checks: SeoCheck[] = [];
  if (input.contentHtml === undefined) return checks;

  const text = stripHtml(input.contentHtml);
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  checks.push(
    wordCount >= 300
      ? { id: "neutral:content-length", status: "good", message: `Content is ${wordCount} words.`, alignment: "provider-neutral" }
      : {
          id: "neutral:content-length",
          status: "ok",
          message: `Content is ${wordCount} words; aim for at least 300 for a standard post.`,
          alignment: "provider-neutral",
        }
  );

  const hasInternalOrOutboundLink = /<a\s+[^>]*href=/i.test(input.contentHtml);
  checks.push(
    hasInternalOrOutboundLink
      ? { id: "neutral:links", status: "good", message: "The content includes at least one link.", alignment: "provider-neutral" }
      : { id: "neutral:links", status: "bad", message: "The content has no links. Add an internal or outbound link.", alignment: "provider-neutral" }
  );

  const images = [...input.contentHtml.matchAll(/<img\s+[^>]*>/gi)];
  if (images.length === 0) {
    checks.push({ id: "neutral:images", status: "ok", message: "The content has no images.", alignment: "provider-neutral" });
  }

  return checks;
}

/** Provider-neutral readability guidance: useful regardless of which plugin is active. */
export function neutralGuidance(): SeoGuidance[] {
  return [
    {
      id: "neutral:readability",
      text:
        "Before submitting drafted or substantially rewritten body content, make a final readability pass: avoid " +
        "three consecutive sentences beginning with the same word, vary sentence openings and length, and prefer " +
        "active voice where it is as clear and accurate as passive voice. Use transition words and short paragraphs " +
        "where they improve the reader's flow. Do not distort technical meaning or force unnatural transitions.",
    },
  ];
}
