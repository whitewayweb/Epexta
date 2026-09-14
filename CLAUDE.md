# WP ChatGPT Publisher — rules for working in this repo

A multi-organisation MCP server platform on Next.js + Payload CMS. The first module is
WordPress publishing; more modules (other integrations) get added the same way.
See [plan.md](plan.md) for the phased roadmap.

## Architecture: platform vs. modules

- `lib/` — platform code shared by every module: `payload.ts` (Payload client),
  `session.ts` (cookie/auth), `auth-actions.ts` (login/signup/logout Server Actions —
  account creation is a platform concern, not a module one), `members.ts` +
  `organisation.ts` (generic organisation/membership model), `crypto.ts` (AES-256-GCM
  for secrets at rest), `modules.ts` (module registry), `entitlements.ts` (per-organisation
  module on/off state — see `MODULE_ENTITLEMENTS_PLAN.md`).
- `components/auth/` — the platform-wide `LoginForm`/`SignupForm` used by
  `/login` and `/signup`. Modules never render their own login/signup UI; they
  redirect unauthenticated visitors to `/login?redirectTo=<module path>` (see
  `app/(frontend)/wordpress/connect/page.tsx`) and get the user back afterwards.
- `collections/` — **only** truly platform-wide Payload collections (`Users`,
  `Organisations`, `ModuleEntitlements`). Never put a module-specific collection here.
- `modules/<name>/` — everything specific to one integration: its own Payload
  collection (referencing `organisation` via a relationship, never re-implementing
  membership itself), its API client, server actions, and UI components.
- Adding a new module means creating `modules/<name>/`, registering its collection
  in `payload.config.ts`, and adding routes under `/api/<name>/mcp` and `/<name>/connect`
  — nothing in `lib/`, `collections/`, or other modules should need to change.
- Every new module's first PR must wire up entitlement enforcement from day one
  (see `lib/entitlements.ts`, `MODULE_ENTITLEMENTS_PLAN.md`), not retrofit it later:
  1. Every page under the module's `overviewPath`/`connectPath` calls
     `requireModuleEnabledForUser` and renders a "not included in your plan" state
     (see `components/module-not-enabled.tsx`) when disabled.
  2. Every Server Action in `modules/<name>/actions.ts` checks entitlement before
     doing anything module-specific (the one exception: an action with its own lazy
     organisation-creation fallback checks entitlement *after* resolving/creating the
     organisation, not before).
  3. `app/api/<name>/mcp/route.ts` computes `moduleEnabled` once in `verifyToken` and
     registers every tool through a `registerGatedTool` wrapper (see the WordPress
     route for the pattern) — never a raw `server.registerTool` call, since a tool
     that reads `extra` directly instead of going through a per-tool helper can
     otherwise skip a per-handler convention entirely.
  4. `components/app-sidebar.tsx`'s module list is filtered by `enabledModuleSlugs`,
     already passed down from `app/(frontend)/(app)/layout.tsx` — no per-module
     change needed there as long as the module is in `lib/modules.ts`'s registry.

## Scalability and future evolution

Design every feature plan and implementation for Epexta as a growing multi-organisation
platform, not just for the customer count or module count that exist today. Don't wait to
be told to think about scale — treat it as a standing requirement, the same way the
security patterns below are never optional.

Before choosing a data model, API shape, or authorization boundary:

- Identify the likely next-stage needs for that feature: more organisations, more
  modules, billing integration, lifecycle states (trials, suspension, expiry),
  auditability, third-party integrations, usage limits, and operational/support needs.
- Prefer durable platform boundaries and stable identifiers over shortcuts specific to
  the feature at hand (e.g. a dedicated collection with a real relationship and a compound
  index over an array field on an existing collection, once more than one axis of data —
  like organisation *and* module *and* provenance — is involved; see
  `MODULE_ENTITLEMENTS_PLAN.md` for a worked example of this exact tradeoff).
- Keep module code dependent on platform interfaces (`lib/`), never on billing internals,
  plan/tier concepts, or another module's internal data model.
- Choose a model that accommodates foreseeable enrichment (new fields, new states) without
  forcing a risky authorization or data migration later.
- Use indexed, constrained persistence for organisation-scoped commercial/entitlement
  state — a unique compound index (`CollectionConfig.indexes`) beats an application-level
  "check before insert," since it holds even under concurrent writes.
- State the migration, rollout, and backwards-compatibility path explicitly for any schema
  or access-control change — see the backfill-before-enforcement pattern in
  `MODULE_ENTITLEMENTS_PLAN.md`'s Phase 1 for what "no existing customer loses access on
  deploy day" looks like in practice.
- Distinguish request-scoped efficiency (memoizing a lookup already made once per request)
  from shared cross-request caching — an access change (a superadmin revoking a module,
  disabling a user) must take effect on the next request, not after some cache expires.
- Call out any assumption in the current implementation that would limit future
  multi-organisation, multi-module, or billing evolution (e.g. `getUserOrganisation`'s
  single-organisation-per-user assumption in `lib/organisation.ts`) rather than silently
  building more on top of it.

Apply this proportionately: avoid speculative systems, unused configuration options, and
premature abstraction for their own sake (per the top-level guidance on not designing for
hypothetical requirements) — but never choose a short-term implementation that creates a
foreseeable structural blocker for Epexta's growth just because it's less work today.

## Engineering quality and consistency

Don't wait to be asked to refactor, reconcile duplication, remove dead code, or check
consistency — treat these as a standing part of finishing any change, the same way
running the Dev workflow checks before considering a change done is standing, not
optional. For every feature plan, implementation, and review:

- Inspect existing platform patterns before creating a new helper, API shape, data model,
  or UI flow. Extend the established pattern (e.g. `lib/organisation.ts`'s
  `getPayloadClient()` + manual-role-check-then-`overrideAccess` shape) when the new code
  has the same responsibility, rather than inventing a parallel way to do the same thing.
- Reuse one authoritative implementation for any cross-cutting behaviour that's expected
  to stay stable — authorization/entitlement checks, input validation, error-result
  formatting, MCP tool/route registration, data-access helpers. Don't copy the same check
  or shape across call sites (this is exactly why `MODULE_ENTITLEMENTS_PLAN.md` centralizes
  entitlement checks into `requireModuleEnabledForUser`/`assertModuleEnabled`/
  `registerGatedTool` instead of one-off `if` statements at each entry point).
- When a change introduces or exposes duplication that represents the *same*
  responsibility, refactor it away as part of that change rather than leaving it for
  later — but keep abstractions small, named for what they actually do, and don't build a
  generic framework to serve what is still genuinely one-off behaviour.
- Reconcile every entry point a change actually touches — pages, Server Actions, route
  handlers, MCP tools, webhooks, background jobs, scheduled tasks, collection `access`
  rules, tests, `CLAUDE.md`/plan docs, and any admin UI — rather than updating the first
  place a symptom shows up and leaving siblings inconsistent (a recurring failure mode:
  see the `list_sites` bypass and stale doc references caught during
  `MODULE_ENTITLEMENTS_PLAN.md`'s own review passes).
- Preserve existing public contracts (route URLs, MCP tool names/schemas, exported
  function signatures other modules import) unless the plan explicitly states a
  compatible migration path for the break — never break one silently as a side effect.
- Before treating a change as complete, remove dead code, stale comments, unused imports,
  contradictory documentation, and superseded code paths that the change itself made
  obsolete — don't leave the old way sitting next to the new way "just in case."
- Verify the result reads as consistent with the rest of the module and the platform
  conventions above, then run the Dev workflow's required checks.

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
  - **Exception: modules sharing a `lib/modules.ts` `group`.** Some MCP clients
    (e.g. ChatGPT-style connectors) let a user register only one URL per connector,
    so several small, closely-related modules under one `group` (e.g. Google Site
    Hub's `google-search-console` + `google-analytics`) may share one MCP route —
    see `GOOGLE_PERFORMANCE_PLAN.md`'s "One Google Site Hub MCP endpoint, not one
    per module." This is a transport-layer decision only: `group` still carries no
    authorization meaning (`lib/modules.ts`), `verifyToken` still computes
    `moduleEnabled` per slug independently, every tool still goes through
    `registerGatedTool` gated on its own module's slug, and tool names must be
    capability-specific (`list_google_analytics_mapped_sites`, not
    `list_mapped_sites`) since two modules' tools now share one server's namespace.
    Default to one route per module; only share a route when a real client
    constraint like this forces it, and document the reasoning in that module's
    own plan doc the way `GOOGLE_PERFORMANCE_PLAN.md` does.
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

### Post image metadata

When creating an image for a WordPress post, set the WordPress media **Title** and
**Alternative Text** to the post title verbatim. Do not derive either field from
the filename or replace it with a separate image description.

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
npm run test
npm run build
```

All five must pass before considering a change done. `knip` loads `payload.config.ts`
standalone (not through Next's bundler), so anything reachable from it — collection
files — must use **relative imports**, not the `@/` alias, or knip's loader breaks.
Everywhere else (Server Actions, pages, components), prefer the `@/` alias.

`npm run test` runs Vitest (`vitest.config.ts`). Most of this suite is integration
tests that talk to the real database via Payload's local API (`getPayloadClient()`) —
there is no mocked Postgres adapter, and a Postgres-specific feature like transactions
can't be verified against one. Tests run serially (`fileParallelism: false`) so
assertions about committed rows never race each other over the same connection pool.
`vitest.setup.ts` loads `.env.local` (Next.js does this automatically; a standalone
Vitest process doesn't), so `DATABASE_URL`/`PAYLOAD_SECRET`/`ENCRYPTION_KEY` must be
set there the same as for `npm run dev`. Co-locate a module's tests next to it as
`*.test.ts` (see `lib/db-transactions.test.ts`) rather than a separate top-level test
tree, the same reasoning as everywhere else in this codebase preferring locality over
a parallel structure.

## Deployment

- Single production deploy on Vercel. Env vars: `DATABASE_URL` (Postgres, provisioned
  via Vercel Marketplace/Neon — Neon's integration also creates a separate branch +
  `DATABASE_URL` per environment, so Production and Preview never share a database),
  `PAYLOAD_SECRET`, `ENCRYPTION_KEY` (32-byte hex —
  `openssl rand -hex 32`). See `.env.local.example`.
- Changing an MCP route's URL breaks any already-registered ChatGPT connector —
  flag this explicitly before renaming a module's route path.
