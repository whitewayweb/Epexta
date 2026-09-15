import { neutralGuidance } from "./providers/neutral";
import { yoastAdapter } from "./providers/yoast";
import { NEUTRAL_ONLY_CAPABILITIES, type SeoProbeContext, type SeoProfile, type SeoProviderAdapter, type SeoProviderId } from "./types";

// The only provider-lookup surface. client.ts, the MCP route, and the connection UI
// all ask this for a profile; none of them import an individual provider directly.
// Phase 3 appends rank-math/aioseo adapters here only - nothing else in this file
// needs to change to support a second provider.
const ADAPTERS: SeoProviderAdapter[] = [yoastAdapter];

function unresolvedProfile(state: "unknown" | "unavailable", context: SeoProbeContext, evidence: SeoProfile["evidence"]): SeoProfile {
  return {
    providerId: null,
    displayName: "Unknown",
    state,
    capabilities: NEUTRAL_ONLY_CAPABILITIES,
    generationGuidance: neutralGuidance(),
    evidence,
    observedAt: context.probedAt,
    error: state === "unavailable" ? (context.probeError ?? null) : null,
  };
}

/**
 * Resolves which SEO provider (if any) applies to a site, from an already-probed
 * SeoProbeContext. Synchronous and pure so every caller can share one probe result
 * instead of re-probing the site per call.
 */
export function resolveSeoProfile(context: SeoProbeContext, _preference: SeoProviderId | "auto"): SeoProfile {
  if (context.probeError) {
    return unresolvedProfile("unavailable", context, []);
  }

  const detections = ADAPTERS.map((adapter) => ({ adapter, detection: adapter.detect(context) }));
  const confirmed = detections.filter((d) => d.detection?.confidence === "confirmed");

  if (confirmed.length === 1) {
    const { adapter, detection } = confirmed[0];
    const capabilities = adapter.capabilities(detection!, context);
    return {
      providerId: adapter.id,
      displayName: adapter.displayName,
      state: "confirmed",
      capabilities,
      generationGuidance: [...neutralGuidance(), ...adapter.guidance(capabilities)],
      evidence: detection!.evidence,
      observedAt: context.probedAt,
      error: null,
    };
  }

  // Unreachable until Phase 3 adds a second adapter - a preference-based `selected`
  // resolution belongs here once there's more than one confirmed candidate to choose
  // between. Handled as `unknown` for now rather than left unimplemented, so this
  // function stays exhaustive over SeoProfileState today.
  const candidateEvidence = detections.flatMap((d) => d.detection?.evidence ?? []);
  return unresolvedProfile("unknown", context, candidateEvidence);
}
