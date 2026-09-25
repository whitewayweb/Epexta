import type { CollectionConfig, FieldHook } from "payload";
import { serverOnlyAccess } from "../../lib/collection-access";
import { decrypt, encrypt } from "../../lib/crypto";
import { GOOGLE_CAPABILITIES } from "./capabilities";

const encryptedTokenField: FieldHook = ({ value }) => (typeof value === "string" && value ? encrypt(value) : value);
const decryptedTokenField: FieldHook = ({ value }) => (typeof value === "string" && value ? decrypt(value) : value);

/** Rejects any attempt to change this field after the document is first created. */
function immutableAfterCreate(fieldLabel: string): FieldHook {
  return ({ value, originalDoc, operation }) => {
    if (operation === "update" && originalDoc && JSON.stringify(originalDoc[fieldLabel]) !== JSON.stringify(value)) {
      throw new Error(`${fieldLabel} cannot be changed after a connection is created.`);
    }
    return value;
  };
}

// Owned by modules/google-connections/ alone - see "Shared Google connections: a real
// owned boundary" in GOOGLE_PERFORMANCE_PLAN.md. Every operational collection this
// package defines returns false for all ordinary Payload REST/GraphQL/admin-panel
// access, the same pattern as collections/ApiKeys.ts: all reads and writes happen
// through this package's own functions (index.ts), which check organisation
// ownership and admin role manually before using overrideAccess: true - never through
// a relaxed collection `access` rule.
export const GoogleConnections: CollectionConfig = {
  slug: "google-connections",
  admin: {
    useAsTitle: "googleAccountLabel",
    description: "Google OAuth connections shared by the Google Site Hub modules. Server-only - see modules/google-connections/index.ts.",
  },
  access: serverOnlyAccess,
  fields: [
    {
      name: "organisation",
      type: "relationship",
      relationTo: "organisations",
      required: true,
      index: true,
    },
    {
      name: "googleAccountLabel",
      type: "text",
      required: true,
      admin: { description: "User-entered display label - reporting scopes never return an email to derive one from." },
    },
    {
      name: "accessToken",
      type: "text",
      admin: { description: "Encrypted at rest. Never readable outside modules/google-connections's own server code." },
      hooks: { beforeChange: [encryptedTokenField], afterRead: [decryptedTokenField] },
      access: { read: () => false },
    },
    {
      name: "refreshToken",
      type: "text",
      admin: { description: "Encrypted at rest. Never readable outside modules/google-connections's own server code." },
      hooks: { beforeChange: [encryptedTokenField], afterRead: [decryptedTokenField] },
      access: { read: () => false },
    },
    {
      name: "grantedScopes",
      type: "json",
      required: true,
      admin: { description: "The scopes Google's token response actually returned. Immutable after creation." },
      hooks: { beforeChange: [immutableAfterCreate("grantedScopes")] },
    },
    {
      name: "scopeProfile",
      type: "select",
      required: true,
      options: GOOGLE_CAPABILITIES.map((slug) => ({ label: slug, value: slug })),
      admin: { description: "The capability this connection was authorized for. Immutable after creation." },
      hooks: { beforeChange: [immutableAfterCreate("scopeProfile")] },
      index: true,
    },
    {
      name: "tokenExpiresAt",
      type: "date",
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "active",
      options: [
        { label: "Active", value: "active" },
        { label: "Needs reconnect", value: "needs_reconnect" },
        { label: "Revoked", value: "revoked" },
      ],
    },
    {
      name: "lastValidatedAt",
      type: "date",
    },
  ],
};

// Short-TTL OAuth state/PKCE storage - see "OAuth mechanics" in
// GOOGLE_PERFORMANCE_PLAN.md. A row is read exactly once, by handleCallback, then
// deleted; there is no legitimate reason for any other code path to read this
// collection, so access is false the same as google-connections itself.
export const GoogleOAuthStates: CollectionConfig = {
  slug: "google-oauth-states",
  admin: {
    useAsTitle: "state",
    description: "Short-lived OAuth state/PKCE records. Server-only - see modules/google-connections/index.ts.",
  },
  access: serverOnlyAccess,
  fields: [
    { name: "state", type: "text", required: true, unique: true, index: true },
    { name: "codeVerifier", type: "text", required: true },
    { name: "user", type: "relationship", relationTo: "users", required: true },
    { name: "organisation", type: "relationship", relationTo: "organisations", required: true },
    {
      name: "capability",
      type: "select",
      required: true,
      options: GOOGLE_CAPABILITIES.map((slug) => ({ label: slug, value: slug })),
    },
    {
      name: "flow",
      type: "json",
      required: true,
      admin: { description: '{ "type": "connect" } or { "type": "reconnect", "connectionId": "..." }' },
    },
    { name: "expiresAt", type: "date", required: true, index: true },
  ],
};
