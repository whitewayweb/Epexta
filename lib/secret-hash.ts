import crypto from "crypto";

/**
 * One-way digest for bearer secrets stored at rest - API keys (lib/api-keys.ts) and OAuth
 * authorization codes/tokens (lib/oauth/). The raw value is shown to its holder once and
 * never stored; looking one up means hashing the presented value and matching on this.
 * Plain SHA-256 (no salt/stretching) is deliberate: these are 256-bit random values, not
 * user-chosen passwords, so a deterministic digest is both safe and indexable.
 */
export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** A URL-safe random secret: `bytes` of CSPRNG output, base64url-encoded, behind a type prefix. */
export function randomSecret(prefix: string, bytes = 32): string {
  return `${prefix}${crypto.randomBytes(bytes).toString("base64url")}`;
}
