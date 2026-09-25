import type { CollectionConfig } from "payload";
import { serverOnlyAccess } from "../lib/collection-access";

// A single-use authorization code issued when a user approves the consent screen
// (lib/oauth/actions.ts). It carries everything the token exchange needs to create the
// grant, so no grant row exists until a client actually redeems a code. Single use is
// enforced by oauth-tokens.issuedFrom's unique index, not by a flag on this row - see
// lib/oauth/tokens.ts exchangeAuthorizationCode.
export const OAuthAuthorizationCodes: CollectionConfig = {
  slug: "oauth-authorization-codes",
  admin: { description: "Short-lived OAuth authorization codes. Server-only - see lib/oauth/authorize.ts." },
  access: serverOnlyAccess,
  fields: [
    { name: "hashedCode", type: "text", required: true, unique: true, index: true },
    { name: "client", type: "relationship", relationTo: "oauth-clients", required: true },
    { name: "user", type: "relationship", relationTo: "users", required: true },
    { name: "organisation", type: "relationship", relationTo: "organisations", required: true },
    { name: "resource", type: "text", required: true },
    { name: "scopes", type: "json", required: true },
    { name: "redirectUri", type: "text", required: true },
    { name: "codeChallenge", type: "text", required: true },
    { name: "expiresAt", type: "date", required: true, index: true },
  ],
};
