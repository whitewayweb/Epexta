import type {
  ProviderWrite,
  SeoCapabilities,
  SeoCheck,
  SeoCheckInput,
  SeoDetection,
  SeoGuidance,
  SeoMetadataInput,
  SeoProbeContext,
  SeoProviderAdapter,
  SeoWriteResult,
} from "../types";
import { countOccurrences, firstParagraphText, includesCi, stripHtml } from "./neutral";

const YOAST_META_KEYS: Record<"seoTitle" | "seoDescription" | "focusKeyphrase", string> = {
  seoTitle: "_yoast_wpseo_title",
  seoDescription: "_yoast_wpseo_metadesc",
  focusKeyphrase: "_yoast_wpseo_focuskw",
};

/**
 * Heuristic re-implementation of Yoast SEO's most load-bearing on-page checks.
 * Runs entirely on the draft content before it ever reaches WordPress, so
 * missing SEO basics surface before publish rather than as a 0-score post.
 */
function runYoastChecks(input: SeoCheckInput): SeoCheck[] {
  const checks: SeoCheck[] = [];
  const keyphrase = input.focusKeyphrase?.trim();
  const aligned = "provider-aligned" as const;

  if (!keyphrase) {
    return [
      {
        id: "yoast:focus-keyphrase",
        status: "bad",
        message: "No focus keyphrase was set. Set one to get an SEO analysis for this post.",
        alignment: aligned,
      },
    ];
  }

  checks.push({ id: "yoast:focus-keyphrase", status: "good", message: `Focus keyphrase set: "${keyphrase}".`, alignment: aligned });

  if (input.title !== undefined) {
    checks.push(
      includesCi(input.title, keyphrase)
        ? { id: "yoast:keyphrase-in-title", status: "good", message: "The focus keyphrase appears in the title.", alignment: aligned }
        : { id: "yoast:keyphrase-in-title", status: "bad", message: "The focus keyphrase does not appear in the title.", alignment: aligned }
    );
  }

  if (input.seoTitle !== undefined) {
    checks.push(
      input.seoTitle.trim().toLowerCase().startsWith(keyphrase.toLowerCase())
        ? { id: "yoast:keyphrase-in-seo-title", status: "good", message: "The SEO title begins with the focus keyphrase.", alignment: aligned }
        : includesCi(input.seoTitle, keyphrase)
          ? {
              id: "yoast:keyphrase-in-seo-title",
              status: "ok",
              message: "The SEO title contains the focus keyphrase but does not begin with it.",
              alignment: aligned,
            }
          : { id: "yoast:keyphrase-in-seo-title", status: "bad", message: "The SEO title does not contain the focus keyphrase.", alignment: aligned }
    );

    const len = input.seoTitle.length;
    checks.push(
      len >= 40 && len <= 60
        ? { id: "yoast:seo-title-length", status: "good", message: `SEO title length is ${len} characters.`, alignment: aligned }
        : { id: "yoast:seo-title-length", status: "ok", message: `SEO title is ${len} characters; aim for roughly 40-60.`, alignment: aligned }
    );
  }

  if (input.seoDescription !== undefined) {
    checks.push(
      includesCi(input.seoDescription, keyphrase)
        ? { id: "yoast:keyphrase-in-meta-description", status: "good", message: "The meta description contains the focus keyphrase.", alignment: aligned }
        : {
            id: "yoast:keyphrase-in-meta-description",
            status: "bad",
            message: "The meta description does not contain the focus keyphrase.",
            alignment: aligned,
          }
    );

    const len = input.seoDescription.length;
    checks.push(
      len >= 120 && len <= 156
        ? { id: "yoast:meta-description-length", status: "good", message: `Meta description length is ${len} characters.`, alignment: aligned }
        : {
            id: "yoast:meta-description-length",
            status: "ok",
            message: `Meta description is ${len} characters; aim for roughly 120-156.`,
            alignment: aligned,
          }
    );
  }

  if (input.slug !== undefined) {
    checks.push(
      includesCi(input.slug, keyphrase.replace(/\s+/g, "-")) || includesCi(input.slug, keyphrase)
        ? { id: "yoast:keyphrase-in-slug", status: "good", message: "The slug contains the focus keyphrase.", alignment: aligned }
        : { id: "yoast:keyphrase-in-slug", status: "bad", message: "The slug does not contain the focus keyphrase.", alignment: aligned }
    );
  }

  if (input.contentHtml !== undefined) {
    const text = stripHtml(input.contentHtml);
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const keyphraseWordCount = keyphrase.split(/\s+/).filter(Boolean).length;

    const intro = firstParagraphText(input.contentHtml);
    checks.push(
      includesCi(intro, keyphrase)
        ? { id: "yoast:keyphrase-in-introduction", status: "good", message: "The focus keyphrase appears in the opening paragraph.", alignment: aligned }
        : {
            id: "yoast:keyphrase-in-introduction",
            status: "bad",
            message: "The focus keyphrase does not appear in the opening paragraph.",
            alignment: aligned,
          }
    );

    const occurrences = countOccurrences(text, keyphrase);
    const density = wordCount > 0 ? (occurrences * keyphraseWordCount * 100) / wordCount : 0;
    checks.push(
      density >= 0.5 && density <= 3
        ? {
            id: "yoast:keyphrase-density",
            status: "good",
            message: `Keyphrase density is ${density.toFixed(1)}% (${occurrences} occurrences).`,
            alignment: aligned,
          }
        : occurrences === 0
          ? { id: "yoast:keyphrase-density", status: "bad", message: "The focus keyphrase does not appear in the body text.", alignment: aligned }
          : {
              id: "yoast:keyphrase-density",
              status: "ok",
              message: `Keyphrase density is ${density.toFixed(1)}% (${occurrences} occurrences); aim for roughly 0.5-3%.`,
              alignment: aligned,
            }
    );

    const headings = [...input.contentHtml.matchAll(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/gi)].map((m) => stripHtml(m[1]));
    if (headings.length > 0) {
      checks.push(
        headings.some((h) => includesCi(h, keyphrase))
          ? { id: "yoast:keyphrase-in-subheading", status: "good", message: "At least one subheading contains the focus keyphrase.", alignment: aligned }
          : { id: "yoast:keyphrase-in-subheading", status: "ok", message: "No subheading contains the focus keyphrase.", alignment: aligned }
      );
    }

    const images = [...input.contentHtml.matchAll(/<img\s+[^>]*>/gi)];
    if (images.length > 0) {
      const hasAltWithKeyphrase = images.some((m) => {
        const altMatch = m[0].match(/alt=["']([^"']*)["']/i);
        return altMatch ? includesCi(altMatch[1], keyphrase) : false;
      });
      checks.push(
        hasAltWithKeyphrase
          ? { id: "yoast:keyphrase-in-image-alt", status: "good", message: "At least one image's alt text contains the focus keyphrase.", alignment: aligned }
          : { id: "yoast:keyphrase-in-image-alt", status: "ok", message: "No image alt text contains the focus keyphrase.", alignment: aligned }
      );
    }
  }

  return checks;
}

function buildWrite(input: SeoMetadataInput): ProviderWrite | null {
  const meta: Record<string, string> = {};
  if (input.seoTitle) meta[YOAST_META_KEYS.seoTitle] = input.seoTitle;
  if (input.seoDescription) meta[YOAST_META_KEYS.seoDescription] = input.seoDescription;
  if (input.focusKeyphrase) meta[YOAST_META_KEYS.focusKeyphrase] = input.focusKeyphrase;
  if (Object.keys(meta).length === 0) return null;
  return { meta, fields: Object.keys(meta) };
}

// WordPress silently drops any meta key that isn't registered with
// register_post_meta(..., ['show_in_rest' => true]) on the site itself - the
// request still succeeds, so this is the only way to detect it didn't take.
function verifyWrite(requested: ProviderWrite, savedPost: { meta?: Record<string, unknown> }): SeoWriteResult {
  const savedMeta = savedPost.meta ?? {};
  const warnings: string[] = [];
  for (const [key, value] of Object.entries(requested.meta)) {
    if (savedMeta[key] !== value) {
      warnings.push(
        `WordPress did not save the "${key}" meta field (Yoast SEO data). The target site needs those keys ` +
          `registered for REST access via register_post_meta() - see README.md for a ready-to-use mu-plugin snippet.`
      );
    }
  }
  return { state: warnings.length === 0 ? "saved" : "rejected", warnings };
}

function detect(context: SeoProbeContext): SeoDetection | null {
  const evidence: SeoDetection["evidence"] = [];

  const hasNamespace = context.restIndexNamespaces.includes("yoast/v1");
  if (hasNamespace) evidence.push({ kind: "route", id: "route:yoast/v1" });

  const samplePostHasField =
    context.samplePost !== undefined &&
    Object.prototype.hasOwnProperty.call(context.samplePost.fields, "yoast_head_json") &&
    context.samplePost.fields.yoast_head_json != null;
  if (samplePostHasField) evidence.push({ kind: "post-field", id: "post-field:yoast_head_json" });

  if (evidence.length === 0) return null;

  return {
    providerId: "yoast",
    confidence: samplePostHasField ? "confirmed" : "candidate",
    evidence,
  };
}

function capabilities(): SeoCapabilities {
  // Capability probing beyond detection (whether _yoast_wpseo_* meta is actually
  // registered for REST) is deferred to Phase 3 - the round-trip verification in
  // verifyWrite is what currently surfaces that fact, after the fact, per write.
  return { metadataWrite: "unknown", categoryWrite: "unknown" };
}

function guidance(): SeoGuidance[] {
  return [
    {
      id: "yoast:readability-pass",
      text:
        "Before submitting drafted or substantially rewritten body content, make a final Yoast-readability pass. " +
        "Avoid three consecutive sentences beginning with the same word, vary sentence openings and length, and " +
        "prefer active voice where it is as clear and accurate as passive voice; aim to keep passive constructions " +
        "at or below Yoast's 10% guideline. Use transition words and short paragraphs where they improve the " +
        "reader's flow. Do not distort technical meaning, force unnatural transitions, or rewrite a sentence " +
        "solely to chase a plugin score.",
    },
  ];
}

export const yoastAdapter: SeoProviderAdapter = {
  id: "yoast",
  displayName: "Yoast SEO",
  detect,
  capabilities,
  guidance,
  checks: (input) => runYoastChecks(input),
  buildWrite: (input) => buildWrite(input),
  verifyWrite,
};
