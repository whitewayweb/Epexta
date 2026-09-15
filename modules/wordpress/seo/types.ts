export type SeoProviderId = "yoast" | "rank-math" | "aioseo";

export type SeoProfileState = "confirmed" | "selected" | "ambiguous" | "unknown" | "unsupported" | "unavailable";

export type SeoCheckStatus = "good" | "ok" | "bad";

export interface SeoCheck {
  id: string;
  status: SeoCheckStatus;
  message: string;
  alignment: "provider-aligned" | "provider-neutral";
}

export interface SeoCheckResult {
  score: "good" | "ok" | "poor" | "not-set";
  checks: SeoCheck[];
}

export interface SeoCheckInput {
  title?: string;
  contentHtml?: string;
  focusKeyphrase?: string;
  seoTitle?: string;
  seoDescription?: string;
  slug?: string;
}

export interface SeoProbeEvidenceItem {
  kind: "route" | "post-field" | "bridge";
  id: string;
}

/**
 * Produced by WordPressClient.probeSeoEvidence(). Provider adapters only ever read
 * this - they never call the WordPress REST API themselves - so every outbound probe
 * request stays auditable in one place (client.ts's wpFetch).
 */
export interface SeoProbeContext {
  restIndexNamespaces: string[];
  restIndexRoutes: string[];
  samplePost?: { id: number; fields: Record<string, unknown> };
  probedAt: string;
  probeError?: string;
}

export interface SeoDetection {
  providerId: SeoProviderId;
  confidence: "confirmed" | "candidate";
  evidence: SeoProbeEvidenceItem[];
}

export interface SeoCapabilities {
  metadataWrite: "confirmed" | "not-exposed" | "unknown";
  categoryWrite: "confirmed" | "not-exposed" | "unknown";
}

export interface SeoGuidance {
  id: string;
  text: string;
}

export interface SeoMetadataInput {
  seoTitle?: string;
  seoDescription?: string;
  focusKeyphrase?: string;
}

export interface ProviderWrite {
  meta: Record<string, string>;
  fields: string[];
}

export type SeoWriteState = "saved" | "not-exposed" | "rejected" | "not-applicable";

export interface SeoWriteResult {
  state: SeoWriteState;
  warnings: string[];
}

export interface SeoProfile {
  providerId: SeoProviderId | null;
  displayName: string;
  state: SeoProfileState;
  capabilities: SeoCapabilities;
  generationGuidance: SeoGuidance[];
  evidence: SeoProbeEvidenceItem[];
  observedAt: string | null;
  error: string | null;
}

/**
 * Contract for a real provider (yoast/rank-math/aioseo). providers/neutral.ts
 * deliberately does not implement this - it's always-on infrastructure, not a
 * detected/selected provider.
 */
export interface SeoProviderAdapter {
  id: SeoProviderId;
  displayName: string;
  detect(context: SeoProbeContext): SeoDetection | null;
  capabilities(detection: SeoDetection, context: SeoProbeContext): SeoCapabilities;
  guidance(capabilities: SeoCapabilities): SeoGuidance[];
  checks(input: SeoCheckInput, capabilities: SeoCapabilities): SeoCheck[];
  buildWrite?(input: SeoMetadataInput, capabilities: SeoCapabilities): ProviderWrite | null;
  verifyWrite?(requested: ProviderWrite, savedPost: { meta?: Record<string, unknown> }): SeoWriteResult;
}

export const NEUTRAL_ONLY_CAPABILITIES: SeoCapabilities = {
  metadataWrite: "not-exposed",
  categoryWrite: "not-exposed",
};
