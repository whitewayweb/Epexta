import type { CollectionConfig } from "payload";
import { serverOnlyAccess } from "../lib/collection-access";

// Opaque access and refresh tokens, stored only as SHA-256 digests (like ApiKeys.hashedKey).
//
// `issuedFrom` is what makes code redemption and refresh rotation race-safe without a
// check-then-insert: every refresh token records its origin as "code:<codeId>" or
// "refresh:<parentTokenId>", and the unique index lets only one insert per origin ever
// succeed - so a replayed code, or two concurrent rotations of the same refresh token,
// can't both mint tokens. Access tokens leave it null (Postgres unique indexes treat
// NULLs as distinct). See lib/oauth/tokens.ts.
export const OAuthTokens: CollectionConfig = {
  slug: "oauth-tokens",
  admin: { description: "Hashed OAuth access/refresh tokens. Server-only - see lib/oauth/tokens.ts." },
  access: serverOnlyAccess,
  fields: [
    { name: "hashedToken", type: "text", required: true, unique: true, index: true },
    { name: "grant", type: "relationship", relationTo: "oauth-grants", required: true, index: true },
    {
      name: "tokenType",
      type: "select",
      required: true,
      options: [
        { label: "Access", value: "access" },
        { label: "Refresh", value: "refresh" },
      ],
    },
    { name: "issuedFrom", type: "text", unique: true, index: true },
    { name: "expiresAt", type: "date", required: true, index: true },
  ],
};
