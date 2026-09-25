// Structured audit events for Epexta's authorization server: one JSON line per event,
// greppable in Vercel's logs as `"event":"oauth.<name>"`. The durable record stays in the
// database (grants keep createdAt, revokedAt, revokedReason, and revokedBy); these lines
// add what the tables don't hold - who approved or denied what, registrations, and the
// security events that triggered a revocation - with ids only, never a token, code, or
// other secret. Collection hooks import this too, so it must stay dependency-free.

type OAuthAuditEvent =
  | "client_registered"
  | "client_rejected"
  | "authorization_approved"
  | "authorization_denied"
  | "grant_created"
  | "grants_revoked";

/** Events that indicate an attack or a broken client, logged at warn level. */
const SECURITY_REASONS = new Set(["code_replay", "refresh_reuse"]);

export function logOAuthEvent(event: OAuthAuditEvent, fields: Record<string, string | number | boolean | null | undefined | string[]>): void {
  const line = JSON.stringify({ event: `oauth.${event}`, at: new Date().toISOString(), ...fields });
  if (event === "client_rejected" || (event === "grants_revoked" && SECURITY_REASONS.has(String(fields.reason)))) {
    console.warn(line);
  } else {
    console.info(line);
  }
}
