import type { CollectionConfig } from "payload";
import { supportReadableAccess } from "../lib/collection-access";

// An OAuth client (Claude, ChatGPT, Claude Code, MCP Inspector, ...) known to Epexta's
// authorization server - see OAUTH_CONNECTOR_PLAN.md "Client registration". Either a
// cached Client ID Metadata Document (client_id is the document's https URL, refetched
// once metadataExpiresAt passes) or a Dynamic Client Registration record (client_id is a
// generated epx_client_ value). Every client is public: PKCE, not a secret, proves the
// token request came from the party that started the authorization.
export const OAuthClients: CollectionConfig = {
  slug: "oauth-clients",
  admin: {
    useAsTitle: "clientName",
    description: "OAuth clients (CIMD cache + dynamically registered). Read-only here - see lib/oauth/clients.ts.",
  },
  access: supportReadableAccess,
  fields: [
    { name: "clientId", type: "text", required: true, unique: true, index: true },
    {
      name: "registrationType",
      type: "select",
      required: true,
      options: [
        { label: "Client ID Metadata Document", value: "cimd" },
        { label: "Dynamic Client Registration", value: "dcr" },
      ],
    },
    { name: "clientName", type: "text", required: true },
    { name: "clientUri", type: "text" },
    { name: "logoUri", type: "text" },
    { name: "redirectUris", type: "json", required: true },
    {
      name: "metadataExpiresAt",
      type: "date",
      admin: { description: "CIMD only: when the cached metadata document must be refetched." },
    },
    { name: "lastUsedAt", type: "date", index: true },
  ],
};
