# WP ChatGPT Publisher — rules for working in this repo

A multi-organisation MCP server platform on Next.js + Payload CMS. The first module is
WordPress publishing; more modules (other integrations) get added the same way.
See [plan.md](plan.md) for the phased roadmap.

## Architecture: platform vs. modules

- `lib/` — platform code shared by every module: `payload.ts` (Payload client),
  `session.ts` (cookie/auth), `auth-actions.ts` (login/signup/logout Server Actions —
  account creation is a platform concern, not a module one), `members.ts` +
  `organisation.ts` (generic organisation/membership model), `crypto.ts` (AES-256-GCM
  for secrets at rest), `modules.ts` (module registry).
- `components/auth/` — the platform-wide `LoginForm`/`SignupForm` used by
  `/login` and `/signup`. Modules never render their own login/signup UI; they
  redirect unauthenticated visitors to `/login?redirectTo=<module path>` (see
  `app/(frontend)/wordpress/connect/page.tsx`) and get the user back afterwards.
- `collections/` — **only** truly platform-wide Payload collections (`Users`,
  `Organisations`). Never put a module-specific collection here.
- `modules/<name>/` — everything specific to one integration: its own Payload
  collection (referencing `organisation` via a relationship, never re-implementing
  membership itself), its API client, server actions, and UI components.
- Adding a new module means creating `modules/<name>/`, registering its collection
  in `payload.config.ts`, and adding routes under `/api/<name>/mcp` and `/<name>/connect`
  — nothing in `lib/`, `collections/`, or other modules should need to change.

## UI: shadcn/ui + Tailwind, no exceptions

Every page and component under `app/`, `components/`, and `modules/*/*.tsx` renders with
the shadcn components in `components/ui/` (Base UI variant — use `render`, not `asChild`;
see `components/ui/button.tsx`) and Tailwind utility classes bound to the theme tokens in
`app/globals.css` (`bg-background`, `text-muted-foreground`, `border-border`, etc.).
Never write raw `style={{ ... }}` objects or unstyled native `<button>`/`<input>` — this
applies to new module UIs too (e.g. a future module's `/connect` page must look like
`app/(frontend)/wordpress/connect/page.tsx`, not the plain HTML it started as). If a needed
primitive doesn't exist yet under `components/ui/`, add it via `npx shadcn@latest add
<name>` rather than hand-rolling markup.

## Route naming

- Each module's MCP endpoint is `/api/<name>/mcp` (folder: `app/api/<name>/mcp/route.ts`).
  `mcp-handler` v2 mounts purely by file location — no `basePath` option and no
  `[transport]` dynamic segment (that was the v1 shape; removed in the v2 migration,
  see `app/api/wordpress/mcp/route.ts`). Put the route file directly at the URL you
  want it to answer on.
- Payload's own REST API lives at `/api/cms/*` (`app/api/cms/[...slug]/route.ts`).
- Payload's admin panel is `/admin`.
- Each module's onboarding UI is `/<name>/connect`.
- Auth is platform-level, not module-level: `/login` and `/signup`
  (`app/(frontend)/login`, `app/(frontend)/signup`) are the only account
  creation/sign-in pages in the app. A module's `/<name>/connect` page redirects an
  anonymous visitor to `/login?redirectTo=/<name>/connect` (or `/signup?redirectTo=...`)
  instead of rendering its own auth form, so the user lands back on that module's
  connect page — with its WordPress-credential fields, for example — right after
  authenticating. Both `loginAction`/`signupAction` (`lib/auth-actions.ts`) only ever
  redirect to a same-site `redirectTo` value (rejecting anything not starting with a
  single `/`), to avoid an open redirect.

## MCP tool guidance — follow the protocol's own division of labor

Per the MCP spec and the MCP project's own guidance on server `instructions`
(https://blog.modelcontextprotocol.io/posts/2025-11-03-using-server-instructions/):
"Server instructions are for explaining your tools, not for modifying how the model
generally responds or behaves," and critical actions "are better implemented as
deterministic rules or hooks," not instructions. Concretely, in
`app/api/wordpress/mcp/route.ts` and any future module's MCP route:

- `serverOptions.instructions` (sent once in the `initialize` handshake, see
  `createMcpHandler(...)`) is for **tool relationships and operational patterns only** —
  "call X before Y," "siteId from list_sites is shared across these tools," rate limits.
  Never put a behavioral policy there ("ask the user before...", "never do X without
  checking Y") — the model can simply ignore prose, and the spec explicitly says not to
  rely on instructions for anything correctness- or security-critical.
- Anything that actually must hold (authorization, an ambiguous required parameter,
  a disallowed operation) is a **deterministic check or protocol interaction** — e.g.
  `resolveConnection`'s required user elicitation when several sites are connected, or
  the org-scoped `extra.connections` lookup that makes cross-org access impossible
  outright (see Security patterns below). A runtime error like that needs its own clear,
  standalone message — don't assume the model still has `instructions` in view.
- For a genuinely ambiguous choice a human should make (not just "the model should try
  harder") — e.g. which of several connected sites — return `inputRequired(...)`
  (`@modelcontextprotocol/server`'s multi-round-trip elicitation, protocol revision
  2026-07-28) so the *client* prompts the user via the protocol; read the answer back
  on the retried call with `acceptedContent`/`inputResponse`. There is no client
  capability to pre-check before eliciting in this protocol revision — the SDK's legacy
  shim degrades gracefully for older clients on its own; don't hand-roll a capability
  probe. Do not silently fall back to model choice. See `resolveConnection` in
  `app/api/wordpress/mcp/route.ts` for the working pattern.
- Tool/param `description` fields stay scoped to that one tool's own mechanics and
  input shape — not a place to restate cross-cutting policy either.

## MCP spec — read the relevant page before implementing, every time

The MCP protocol (currently revision `2026-07-28`) changes fast enough that memorized
knowledge of it is unreliable — this repo's own MCP route was built against a SDK
version two protocol revisions behind current before the 2026-09 migration. Before
adding to or changing behavior in any of these areas, fetch the matching spec page,
actually read it, and reason about how it applies to *this* codebase's constraints
(the role model, no-delete-tools rule, org-scoped auth) before writing code — do not
implement from memory or from a summary of a summary:

- **Tools** — https://modelcontextprotocol.io/specification/2026-07-28/server/tools
  (tool/result shape, annotations, `outputSchema`/`structuredContent`, error reporting
  via `isError` vs. protocol errors, stateful-tool handle patterns)
- **Resources** — https://modelcontextprotocol.io/specification/2026-07-28/server/resources
  (only relevant once a module exposes `resources/*`, none do yet)
- **Prompts** — https://modelcontextprotocol.io/specification/2026-07-28/server/prompts
  (only relevant once a module exposes `prompts/*`, none do yet)
- **Discover** — https://modelcontextprotocol.io/specification/2026-07-28/server/discover
- **Elicitation** — https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation
  (form vs. url mode, the multi-round-trip `inputRequired`/`inputResponses` flow used by
  `resolveConnection`; re-read this before touching that function)
- **Sampling** — https://modelcontextprotocol.io/specification/2026-07-28/client/sampling
  (not used anywhere in this codebase yet — read this first if a future tool wants to
  ask the client's LLM for a completion, rather than assuming the old
  `requestSampling`/`createMessage` push API still works, it's deprecated in this
  revision)
- **Roots** — https://modelcontextprotocol.io/specification/2026-07-28/client/roots
  (not used anywhere in this codebase yet)

After reading, explicitly evaluate the options the spec presents (e.g. form vs. url
elicitation, whether a result needs `outputSchema`) against this repo's actual
constraints before picking an approach — don't default to whatever the first code
example shows.

## Role model — three distinct levels, do not conflate them

1. **`superadmin`** (on the `Users` collection `role` field) — the only role that can
   open `/admin` at all, enforced via `Users.access.admin`. This is the platform
   owner, not a customer.
2. **Organisation `admin`** (in an `Organisations` doc's `members[]`) — manages that
   organisation's module connections (e.g. the WordPress site + Application
   Password), invites/removes organisation members, generates their own API key.
3. **Organisation `member`** — gets their own API key to use a module's MCP tools
   against the organisation's connection, but cannot see or edit the connection,
   cannot manage other members.

Never let a public signup (`lib/auth-actions.ts` `signupAction`) set its own role —
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
  caller's organisation role themselves (see `modules/wordpress/actions.ts` for the
  pattern — check `getUserOrganisation(user.id).role` before any mutation).
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
- All mutations from client components go through `"use server"` action files —
  `lib/auth-actions.ts` for login/signup/logout, `modules/<name>/actions.ts` for
  everything module-specific — invoked via `useActionState`, never via a
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
  `openssl rand -hex 32`). See `.env.local.example`.
- Changing an MCP route's URL breaks any already-registered ChatGPT connector —
  flag this explicitly before renaming a module's route path.
