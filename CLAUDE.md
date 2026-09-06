# WP ChatGPT Publisher — rules for working in this repo

A multi-tenant MCP server platform on Next.js + Payload CMS. The first module is
WordPress publishing; more modules (other integrations) get added the same way.
See [plan.md](plan.md) for the phased roadmap.

## Architecture: platform vs. modules

- `lib/` — platform code shared by every module: `payload.ts` (Payload client),
  `session.ts` (cookie/auth), `members.ts` + `tenant.ts` (generic tenant/membership
  model), `crypto.ts` (AES-256-GCM for secrets at rest), `modules.ts` (module registry).
- `collections/` — **only** truly platform-wide Payload collections (`Users`, `Tenants`).
  Never put a module-specific collection here.
- `modules/<name>/` — everything specific to one integration: its own Payload
  collection (referencing `tenant` via a relationship, never re-implementing
  membership itself), its API client, server actions, and UI components.
- Adding a new module means creating `modules/<name>/`, registering its collection
  in `payload.config.ts`, and adding routes under `/api/<name>/mcp` and `/<name>/connect`
  — nothing in `lib/`, `collections/`, or other modules should need to change.

## Route naming

- Each module's MCP endpoint is `/api/<name>/mcp` (folder: `app/api/<name>/[transport]/route.ts`,
  `basePath: "/api/<name>"`). `mcp-handler` requires the **last** path segment to be
  the literal transport type (`mcp` or `sse`) — never put the module name after it.
- Payload's own REST API lives at `/api/cms/*` (`app/api/cms/[...slug]/route.ts`).
- Payload's admin panel is `/admin`.
- Each module's onboarding UI is `/<name>/connect`.

## Role model — three distinct levels, do not conflate them

1. **`superadmin`** (on the `Users` collection `role` field) — the only role that can
   open `/admin` at all, enforced via `Users.access.admin`. This is the platform
   owner, not a customer.
2. **Tenant `admin`** (in a `Tenants` doc's `members[]`) — manages that tenant's
   module connections (e.g. the WordPress site + Application Password), invites/
   removes tenant members, generates their own API key.
3. **Tenant `member`** — gets their own API key to use a module's MCP tools against
   the tenant's connection, but cannot see or edit the connection, cannot manage
   other members.

Never let a public signup (`modules/*/actions.ts` `signupAction`) set its own role —
`Users.ts`'s `beforeChange` hook forces `customer` unless the creating request is
already an authenticated superadmin. The very first user ever created becomes
`superadmin` automatically (bootstrap case).

## Security patterns to keep consistent

- Secrets (WordPress Application Passwords, etc.) are always encrypted at rest via
  `lib/crypto.ts` field hooks (`beforeChange`/`afterRead`) — never store a module
  credential in plaintext.
- Collection `access` functions run inside Payload's own request lifecycle: use
  `req.payload.find/findByID(...)` directly, **never** `getPayloadClient()` from
  `lib/payload.ts` inside a collection config (risks re-entering `payload.config.ts`
  during its own initialization).
- Server Actions and page code (outside Payload's request lifecycle) do the
  opposite: use `getPayloadClient()` from `lib/payload.ts`, and call local-API
  operations with `overrideAccess: true` **only after** manually checking the
  caller's tenant role themselves (see `modules/wordpress/actions.ts` for the
  pattern — check `getUserTenant(user.id).role` before any mutation).
- Never put a secret (API key, token) in a URL, query string, or redirect. A
  newly-generated API key is shown once via React state in the page that
  generated it (see `ApiKeyPanel.tsx`), never round-tripped through a URL.
- **No delete tools.** No MCP tool in any module should expose destructive
  operations (deleting posts, media, users, etc.) — this is a deliberate, standing
  constraint, not an oversight. Keep every module's blast radius to create/read/update.

## Client/server boundary

- Never import `lib/payload.ts`, `lib/crypto.ts`, or any module's Payload-touching
  code into a `"use client"` component at runtime. Type-only imports
  (`import type { ... }`) are fine — they're erased at compile time.
- All mutations from client components go through `"use server"` action files
  (`modules/<name>/actions.ts`), invoked via `useActionState`, never via a
  hand-rolled `fetch` to a REST endpoint from client code.

## Dev workflow

```bash
npm run typecheck
npm run lint
npm run knip
npm run build
```

All four must pass before considering a change done. `knip` loads `payload.config.ts`
standalone (not through Next's bundler), so anything reachable from it — collection
files — must use **relative imports**, not the `@/` alias, or knip's loader breaks.
Everywhere else (Server Actions, pages, components), prefer the `@/` alias.

## Deployment

- Single production deploy on Vercel. Env vars: `DATABASE_URL` (Postgres, provisioned
  via Vercel Marketplace/Neon — Neon's integration also creates a separate branch +
  `DATABASE_URL` per environment, so Production and Preview never share a database),
  `PAYLOAD_SECRET`, `ENCRYPTION_KEY` (32-byte hex —
  `openssl rand -hex 32`), plus the legacy single-site `WP_SITE_URL`/`WP_USERNAME`/
  `WP_APP_PASSWORD` fallback vars (see `.env.local.example`).
- Changing an MCP route's URL breaks any already-registered ChatGPT connector —
  flag this explicitly before renaming a module's route path.
