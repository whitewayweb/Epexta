import type { CollectionConfig } from "payload";
import { decrypt, encrypt } from "../lib/crypto";

export const Connections: CollectionConfig = {
  slug: "connections",
  admin: {
    useAsTitle: "siteUrl",
    description: "One WordPress site connection per user, used by the MCP tools.",
  },
  access: {
    read: ({ req }) => (req.user ? { owner: { equals: req.user.id } } : false),
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => (req.user ? { owner: { equals: req.user.id } } : false),
    delete: ({ req }) => (req.user ? { owner: { equals: req.user.id } } : false),
  },
  fields: [
    {
      name: "owner",
      type: "relationship",
      relationTo: "users",
      required: true,
      defaultValue: ({ user }: { user?: { id: string } }) => user?.id,
      admin: { position: "sidebar" },
    },
    {
      name: "siteUrl",
      type: "text",
      required: true,
      admin: { description: "e.g. https://example.com (no trailing slash)" },
    },
    {
      name: "username",
      type: "text",
      required: true,
    },
    {
      name: "appPassword",
      type: "text",
      required: true,
      hooks: {
        beforeChange: [({ value }) => (typeof value === "string" && value ? encrypt(value) : value)],
        afterRead: [({ value }) => (typeof value === "string" && value ? decrypt(value) : value)],
      },
      admin: {
        description: "WordPress Application Password (24-char, encrypted at rest).",
      },
    },
  ],
};
