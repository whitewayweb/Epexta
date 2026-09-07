export interface SeoCheckInput {
  title?: string;
  contentHtml?: string;
  focusKeyphrase?: string;
  seoTitle?: string;
  seoDescription?: string;
  slug?: string;
}

export type SeoCheckStatus = "good" | "ok" | "bad" | "skipped";

export interface SeoCheck {
  id: string;
  status: SeoCheckStatus;
  message: string;
}

export interface SeoCheckResult {
  score: "good" | "ok" | "poor" | "not-set";
  checks: SeoCheck[];
}

function stripHtml(html: string): string {
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

function firstParagraphText(html: string): string {
  const match = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  return stripHtml(match ? match[1] : html.slice(0, 400));
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escaped, "gi");
  return (haystack.match(re) ?? []).length;
}

function includesCi(haystack: string | undefined, needle: string): boolean {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Heuristic re-implementation of Yoast SEO's most load-bearing on-page checks.
 * Runs entirely on the draft content before it ever reaches WordPress, so
 * missing SEO basics surface before publish rather than as a 0-score post.
 */
export function runSeoChecks(input: SeoCheckInput): SeoCheckResult {
  const checks: SeoCheck[] = [];
  const keyphrase = input.focusKeyphrase?.trim();

  if (!keyphrase) {
    return {
      score: "not-set",
      checks: [
        {
          id: "focus-keyphrase",
          status: "bad",
          message: "No focus keyphrase was set. Set one to get an SEO analysis for this post.",
        },
      ],
    };
  }

  checks.push({ id: "focus-keyphrase", status: "good", message: `Focus keyphrase set: "${keyphrase}".` });

  if (input.title !== undefined) {
    checks.push(
      includesCi(input.title, keyphrase)
        ? { id: "keyphrase-in-title", status: "good", message: "The focus keyphrase appears in the title." }
        : {
            id: "keyphrase-in-title",
            status: "bad",
            message: "The focus keyphrase does not appear in the title.",
          }
    );
  }

  if (input.seoTitle !== undefined) {
    checks.push(
      input.seoTitle.trim().toLowerCase().startsWith(keyphrase.toLowerCase())
        ? { id: "keyphrase-in-seo-title", status: "good", message: "The SEO title begins with the focus keyphrase." }
        : includesCi(input.seoTitle, keyphrase)
          ? {
              id: "keyphrase-in-seo-title",
              status: "ok",
              message: "The SEO title contains the focus keyphrase but does not begin with it.",
            }
          : {
              id: "keyphrase-in-seo-title",
              status: "bad",
              message: "The SEO title does not contain the focus keyphrase.",
            }
    );

    const len = input.seoTitle.length;
    checks.push(
      len >= 40 && len <= 60
        ? { id: "seo-title-length", status: "good", message: `SEO title length is ${len} characters.` }
        : {
            id: "seo-title-length",
            status: "ok",
            message: `SEO title is ${len} characters; aim for roughly 40-60.`,
          }
    );
  }

  if (input.seoDescription !== undefined) {
    checks.push(
      includesCi(input.seoDescription, keyphrase)
        ? {
            id: "keyphrase-in-meta-description",
            status: "good",
            message: "The meta description contains the focus keyphrase.",
          }
        : {
            id: "keyphrase-in-meta-description",
            status: "bad",
            message: "The meta description does not contain the focus keyphrase.",
          }
    );

    const len = input.seoDescription.length;
    checks.push(
      len >= 120 && len <= 156
        ? { id: "meta-description-length", status: "good", message: `Meta description length is ${len} characters.` }
        : {
            id: "meta-description-length",
            status: "ok",
            message: `Meta description is ${len} characters; aim for roughly 120-156.`,
          }
    );
  }

  if (input.slug !== undefined) {
    checks.push(
      includesCi(input.slug, keyphrase.replace(/\s+/g, "-")) || includesCi(input.slug, keyphrase)
        ? { id: "keyphrase-in-slug", status: "good", message: "The slug contains the focus keyphrase." }
        : { id: "keyphrase-in-slug", status: "bad", message: "The slug does not contain the focus keyphrase." }
    );
  }

  if (input.contentHtml !== undefined) {
    const text = stripHtml(input.contentHtml);
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const keyphraseWordCount = keyphrase.split(/\s+/).filter(Boolean).length;

    checks.push(
      wordCount >= 300
        ? { id: "content-length", status: "good", message: `Content is ${wordCount} words.` }
        : {
            id: "content-length",
            status: "ok",
            message: `Content is ${wordCount} words; aim for at least 300 for a standard post.`,
          }
    );

    const intro = firstParagraphText(input.contentHtml);
    checks.push(
      includesCi(intro, keyphrase)
        ? { id: "keyphrase-in-introduction", status: "good", message: "The focus keyphrase appears in the opening paragraph." }
        : {
            id: "keyphrase-in-introduction",
            status: "bad",
            message: "The focus keyphrase does not appear in the opening paragraph.",
          }
    );

    const occurrences = countOccurrences(text, keyphrase);
    const density = wordCount > 0 ? (occurrences * keyphraseWordCount * 100) / wordCount : 0;
    checks.push(
      density >= 0.5 && density <= 3
        ? { id: "keyphrase-density", status: "good", message: `Keyphrase density is ${density.toFixed(1)}% (${occurrences} occurrences).` }
        : occurrences === 0
          ? { id: "keyphrase-density", status: "bad", message: "The focus keyphrase does not appear in the body text." }
          : {
              id: "keyphrase-density",
              status: "ok",
              message: `Keyphrase density is ${density.toFixed(1)}% (${occurrences} occurrences); aim for roughly 0.5-3%.`,
            }
    );

    const headings = [...input.contentHtml.matchAll(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/gi)].map((m) =>
      stripHtml(m[1])
    );
    if (headings.length > 0) {
      checks.push(
        headings.some((h) => includesCi(h, keyphrase))
          ? { id: "keyphrase-in-subheading", status: "good", message: "At least one subheading contains the focus keyphrase." }
          : {
              id: "keyphrase-in-subheading",
              status: "ok",
              message: "No subheading contains the focus keyphrase.",
            }
      );
    }

    const hasInternalOrOutboundLink = /<a\s+[^>]*href=/i.test(input.contentHtml);
    checks.push(
      hasInternalOrOutboundLink
        ? { id: "links", status: "good", message: "The content includes at least one link." }
        : { id: "links", status: "bad", message: "The content has no links. Add an internal or outbound link." }
    );

    const images = [...input.contentHtml.matchAll(/<img\s+[^>]*>/gi)];
    if (images.length > 0) {
      const hasAltWithKeyphrase = images.some((m) => {
        const altMatch = m[0].match(/alt=["']([^"']*)["']/i);
        return altMatch ? includesCi(altMatch[1], keyphrase) : false;
      });
      checks.push(
        hasAltWithKeyphrase
          ? { id: "keyphrase-in-image-alt", status: "good", message: "At least one image's alt text contains the focus keyphrase." }
          : {
              id: "keyphrase-in-image-alt",
              status: "ok",
              message: "No image alt text contains the focus keyphrase.",
            }
      );
    } else {
      checks.push({ id: "images", status: "ok", message: "The content has no images." });
    }
  }

  const bad = checks.filter((c) => c.status === "bad").length;
  const ok = checks.filter((c) => c.status === "ok").length;
  const score: SeoCheckResult["score"] = bad > 0 ? "poor" : ok > 0 ? "ok" : "good";

  return { score, checks };
}
