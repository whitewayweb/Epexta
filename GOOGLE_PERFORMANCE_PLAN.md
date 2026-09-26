# Google Site Hub: implementation plan

## Purpose

**Google Site Hub** is a UI grouping and commercial family, not a single
module or a single permission boundary. It brings together Epexta's Google
integrations — starting with search and analytics reporting, with room for
PageSpeed, Tag Manager, Site Setup, and monetisation reporting later — each as
its own independently-registered, independently-entitled module. An
organisation can enable one Google Site Hub module without the others, using
a different connected Google account for each if it wants to.

This plan covers the first two modules to ship: **Google Search Console** and
**Google Analytics**. Both are read-only reporting modules that close the loop
between writing a WordPress post and learning how it performs. Every other Google
Site Hub module is deliberately out of scope for this plan (see Future Google
Site Hub modules below) so its own security/entitlement boundary can be
designed on its own terms when it's actually built.

Epexta connects only to existing Google Analytics and Search Console properties
that the user already has permission to access. Creating Google accounts,
properties, site ownership, or Google tags remains outside Epexta.

Both modules must preserve Epexta's existing organisation boundaries and
multi-site safety guarantees. Neither must infer that a WordPress domain belongs
to a particular Google property, and neither must ever edit a post without an
explicit user-approved WordPress action.

## Why two modules, not one

Search Console and GA4 access are genuinely independent axes: they're often
owned by different people at a customer, granted through different Google
accounts, and useful on their own — a customer may want Search Console alone
and add GA4 later without touching the Search Console connection, or vice
versa. Modelling them as one module with an internal "search-only mode" (the
shape of the original single-module draft of this plan) forces every
future capability decision (billing, per-capability support/incident
scoping, per-capability rate limits) through one entitlement flag that
doesn't actually match how customers adopt the two capabilities. Splitting
them now, while there's only one existing module (WordPress) to keep
consistent with, is far cheaper than migrating a combined entitlement and
mapping model later once real customer data depends on it.

## Google Site Hub as a registry grouping

`lib/modules.ts`'s registry entry shape gains one new field: `group` (a
free-text grouping key, e.g. `"google-site-hub"`), used purely for navigation.
It carries no authorization meaning — entitlement, connection, and mapping
data are all still keyed by the module's own slug, never by the group.
`buildAppNav` (`components/app-nav.ts`) gives the sidebar one "Google Site Hub" section containing
whichever child modules are enabled for the organisation, the same way it
already filters by `enabledModuleSlugs` — grouping only changes how enabled
modules are presented, not which ones are enabled.

Registry entries this plan adds:

```text
google-search-console   group: "google-site-hub"   overviewPath: "/google-search-console"        connectPath: "/google-search-console/connect"
google-analytics        group: "google-site-hub"   overviewPath: "/google-analytics"              connectPath: "/google-analytics/connect"
```

Each is registered, entitled, gated, and routed exactly like any other module
per `CLAUDE.md`'s module checklist — nothing about grouping changes that
checklist.

## Module shape

Create two new modules, `modules/google-search-console/` and
`modules/google-analytics/`. Each owns its own OAuth connect/reconnect flow,
property discovery, reporting client, mapping UI, and MCP tools. Do not add
Google-specific *business logic* to `modules/wordpress/` or platform-wide
`lib/` files — the minimal platform integration below is not an exception to
that rule, it's the same registry/entitlement wiring every module goes
through:

- the two `lib/modules.ts` registry entries above;
- registering each module's Payload collections in `payload.config.ts`;
- an entitlement migration adding `"google-search-console"` and
  `"google-analytics"` as two separate slugs in the `ModuleEntitlements` enum
  (see Entitlements below) — never one combined slug.

### Entitlements

Per `CLAUDE.md`'s standing rule that a module's first PR wires up entitlement
enforcement from day one, both modules follow the WordPress pattern
(`MODULE_ENTITLEMENTS_PLAN.md`) independently:

- `"google-search-console"` and `"google-analytics"` are separate slugs in the
  `ModuleEntitlements` enum/migration. New organisations are disabled for
  both by default — entitlement is granted explicitly per module
  (backfill-before-enforcement: no organisation gains access on deploy day
  without an explicit grant).
- Enablement is organisation-level, like the existing WordPress entitlement —
  not per individual member. An organisation member can use an enabled
  module's read-only tools; only organisation admins manage that module's
  connections and mappings.
- Every page under `/google-search-console`, `/google-search-console/connect`,
  `/google-analytics`, and `/google-analytics/connect` calls
  `requireModuleEnabledForUser` for its own module slug and renders
  `components/module-not-enabled.tsx` when disabled.
- Every Server Action in each module's `actions.ts` checks that module's own
  entitlement before doing anything module-specific, with the same lazy-
  organisation-creation exception documented in `CLAUDE.md`.
- The combined `app/api/google/mcp/route.ts` (see "One Google Site Hub MCP
  endpoint, not one per module") computes each module's `moduleEnabled`
  independently, once per request, in its `buildExtra` (passed to
  `withEpextaMcpAuth`, `lib/mcp-auth.ts`), and registers every tool through
  `registerGatedTool` — never a raw `server.registerTool` call, and never a
  tool that reads `extra` directly instead of going through the per-tool
  helper.
- An organisation can be entitled to one module and not the other. Neither
  module's gating logic may read or depend on the other module's
  entitlement.

## Shared Google connections: a real owned boundary

`google-connections` does not exist in this codebase yet — it is new shared
infrastructure, not something either module can informally assume. Because
it is genuinely shared between `google-search-console` and `google-analytics`
(and, later, other Google Site Hub modules) but is not platform-wide the way
`Users`/`Organisations`/`ModuleEntitlements` are — WordPress has no use for
it — it does not belong in top-level `collections/` either. Give it its own
package, `modules/google-connections/`, that owns the collection, the OAuth
state/PKCE storage, and all secret handling, and exports one small typed
interface that both modules import. This is the single place OAuth and
secret-handling logic lives; neither module reimplements any of it — that
duplication is exactly what the two-module split would otherwise invite.

`modules/google-connections/` is registered in `payload.config.ts` like any
module's collections, but it is **not** registered in `lib/modules.ts`'s
module registry and has no entitlement of its own — it has no pages, no
`overviewPath`, nothing a user browses to directly. Each entitlement check
still lives in the *consuming* module (`google-search-console`,
`google-analytics`); `google-connections` only enforces organisation
ownership and secret handling, never module-level entitlement, since it has
no way to know which module is asking without being told (see the typed
interface below).

### Collection shape and access rules

```text
organisation                 relationship to organisations
googleAccountLabel           user-entered display label for this connection
accessToken                  encrypted, short-lived token when retained
refreshToken                 encrypted
grantedScopes                array; the scopes Google actually returned
scopeProfile                 the capability this connection was authorized for,
                              e.g. "google-search-console" | "google-analytics";
                              immutable after creation (see Scope isolation below)
tokenExpiresAt               date
status                       active | needs_reconnect | revoked
lastValidatedAt              date
```

- **Collection `access`**: `read`/`update`/`delete` restricted to organisation
  admins of the connection's own `organisation` (checked the same way
  `modules/wordpress/actions.ts` checks admin role today — manually, before
  any `overrideAccess: true` local-API call). `create` only through the OAuth
  callback's server-side exchange, never a direct client-facing create.
  Organisation members get no access to this collection at all — reporting
  tools read through the module's server-side client, never through a
  member's own Payload query.
- **Field-level token redaction**: `accessToken` and `refreshToken` use
  `lib/crypto.ts`'s `beforeChange`/`afterRead` encryption hooks *and* a
  field-level `access.read` that returns `false` for every request except an
  internal server-side call that explicitly opts in with `overrideAccess:
  true` from within `modules/google-connections/`'s own client functions.
  This means the decrypted token value can never surface through Payload's
  REST (`/api/cms/*`), GraphQL, or admin-panel responses, regardless of
  caller role — the only code path that ever sees a decrypted token is the
  token-exchange/refresh logic inside `modules/google-connections/` itself.
- **Server-only access is not just a credential-field concern.** Every
  operational collection this plan adds — `google-oauth-states`,
  `report-refresh-leases`, the quota-usage/property-quota collections, and
  both modules' report snapshot collections — gets the same treatment as
  `google-connections` itself: collection-level `access.read/create/update/
  delete` that returns `false` for every ordinary request, so nothing in
  these collections is reachable through Payload's REST, GraphQL, or admin
  surfaces at all. They are read and written exclusively by their owning
  module's own server-side code using `overrideAccess: true` from inside
  that code path — never exposed to an organisation admin, an organisation
  member, or a superadmin through the generic Payload API, since none of
  that data (snapshot cache contents, lease/quota bookkeeping) is meant to
  be an end-user-facing collection at all. Where a superadmin genuinely needs
  visibility for support (e.g. inspecting a stuck lease or quota state), that
  goes through a dedicated read-only server action/admin view that itself
  checks `role === "superadmin"`, not through relaxing the collection's own
  `access` rules.
- **OAuth state storage**: a second collection owned by the same package,
  `google-oauth-states`, holds the short-TTL `state`/PKCE `code_verifier`
  records described under OAuth mechanics below (bound to user, organisation,
  initiating module, and flow). Same access rule: no client-facing read
  access at all; only the callback handler reads it, and only once, before
  deleting/invalidating the row.

### Public interface both modules use

`modules/google-connections/index.ts` exports the only surface either module
touches — no module reaches into the collection directly:

```text
startAuthorization(userId, organisationId, capability, flow)
  -> { authorizationUrl, stateToken }
handleCallback(stateToken, callbackParams)
  -> { status: "connected", connectionId }
   | { status: "denied" } | { status: "error", reason }
getConnectionForCapability(organisationId, connectionId, capability)
  -> the connection's public fields (label, status, lastValidatedAt) — never tokens
listConnectionsForCapability(organisationId, capability)
  -> connections whose scopeProfile matches capability, public fields only
executeGoogleApiRequest(connectionId, capability, request)
  -> validates `{ method, url }` against the fixed, hardcoded per-capability
     method+URL-pattern allowlist below, refreshes the connection's token
     internally if needed, attaches it to the outbound request itself,
     performs exactly that one HTTP call, and returns only the parsed
     response body (or a typed failure). Returns a typed failure (never
     throws a bare error, never returns a partially-applied request object)
     if the connection is revoked, needs_reconnect, scopeProfile mismatches
     capability, or `{ method, url }` isn't on the capability's allowlist.
revokeConnection(organisationId, connectionId, actingUserId)
disconnectOrDelete(organisationId, connectionId, actingUserId)  -- see Lifecycle below
```

Two earlier designs for this both leaked the secret boundary they were meant
to close. `getAccessTokenForRequest` returned a raw token string for the
caller to use — nothing stopped a consuming module from holding onto it,
logging it, or making several calls with it. `withAccessTokenForRequest`'s
callback shape (`fn(accessToken)`) looked safer, but it still handed the
literal token value into a function object supplied by the *other* module —
that callback closure runs with the token as an argument in its own scope,
where the calling module's code can still store it in a variable, log it, or
retain it past the call, since a callback parameter is not actually
different from a return value once the callee has invoked code the caller
wrote.

`executeGoogleApiRequest` fixes this by never handing the token to
consuming-module code at all, in any form — the consuming module supplies
only *what to fetch* (a method, URL, and body/query — plain data, not a
function), and `modules/google-connections/` does the entire HTTP call
itself internally, attaching the token to the request from inside its own
code, in its own stack frame, with no reachable extension point for the
caller to intercept, wrap, or observe the token. The consuming module
receives back only the response.

**The allowlist is a per-capability method + URL-pattern list, not a bare
origin allowlist.** An origin-only check (e.g. "google-search-console may
call anything under `www.googleapis.com/webmasters/v3/*`") turns out not to
match the actual APIs each capability needs to call — `check_post_indexing`
requires Search Console's URL Inspection endpoint, which lives on a
*different host* (`searchconsole.googleapis.com`) from the Webmasters v3
reporting API, and GA4 property discovery and property-timezone lookup use
the Analytics Admin API host (`analyticsadmin.googleapis.com`), not the
Analytics Data API host (`analyticsdata.googleapis.com`) used for reporting.
An origin allowlist would either have to allow an entire second host per
capability (widening the surface further than any single planned feature
needs) or would simply be wrong and block a feature this plan already
requires. A method+URL-pattern allowlist can grant exactly the routes each
capability's already-planned features use and nothing else:

```text
google-search-console:
  GET  https://www.googleapis.com/webmasters/v3/sites
  GET  https://www.googleapis.com/webmasters/v3/sites/*
  POST https://www.googleapis.com/webmasters/v3/sites/*/searchAnalytics/query
  POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect

google-analytics:
  POST https://analyticsdata.googleapis.com/v1beta/properties/*:runReport
  GET  https://analyticsadmin.googleapis.com/v1beta/accountSummaries
  GET  https://analyticsadmin.googleapis.com/v1beta/properties/*
```

Each entry is a fixed `(method, host+path pattern)` pair, not a wildcarded
host — the Admin API entries above are deliberately narrowed to only the
read routes property discovery and timezone lookup actually need
(`accountSummaries` listing and a single property's own details), not every
route the Admin API exposes (which includes writes this module must never be
able to reach). This list is exhaustive and hardcoded inside
`modules/google-connections/`, not configurable by either consuming module —
adding a new route means editing this list deliberately, the same review
weight as adding a new scope.

`capability` is always the caller's own module slug (`"google-search-console"`
or `"google-analytics"`) — `executeGoogleApiRequest` and
`getConnectionForCapability` both verify `scopeProfile === capability` and
refuse otherwise, so one module can never get a request executed with a
working access token through a connection it doesn't own the capability for,
even if it somehow gets hold of the connection ID.

### Scope isolation: validate what Google actually returns

**A connection's `grantedScopes` is treated as immutable once persisted**, but
"never upgrade a connection" is not enough on its own — `startAuthorization`
also records the *requested* scope for `scopeProfile`, and `handleCallback`
validates that the scopes Google's token response actually returned are
exactly the expected set for that `scopeProfile` (a fixed, hardcoded mapping
inside `modules/google-connections/`, not derived from client input). If
Google's grant is broader than the profile allows (e.g. a previously-granted
scope came along for the ride, or a user's browser had a stale consent
screen), `handleCallback` refuses to save the connection as that
`scopeProfile` — it returns an error result rather than persisting a
connection whose actual grant exceeds what its owning module is allowed to
rely on. This is stricter than "the required scope is present": a connection
with more access than its module needs is treated as a rejected exchange, not
a lucky bonus, so `scopeProfile` remains a true, checkable ceiling on what
that connection can ever be used for.

Each module's connect flow still only *requests* the one scope it needs
(`webmasters.readonly` for Search Console, `analytics.readonly` for
Analytics), and, on the mapping wizard, lets the admin either pick an
existing connection whose `scopeProfile` matches, or authorize a brand-new
one. There is no "upgrade this connection's scopes" action, and there never
will be — if a future module (e.g. Tag Manager) needs an elevated or
different scope, it authorizes its own new connection with its own
`scopeProfile` rather than broadening an existing one.

### Connection lifecycle

- **Disconnect (revoke) vs. delete are different operations.** Revoking sets
  `status: "revoked"` and leaves the row (and its history) in place; deleting
  removes the row entirely and is only permitted when nothing still
  references it.
- **Deletion is blocked while referenced.** `disconnectOrDelete` checks both
  modules' mapping collections (via each module's own narrow "does anything
  reference this connection ID" check, called from
  `modules/google-connections/`, not by that package querying another
  module's collection schema directly) and refuses a hard delete while any
  mapping — active or superseded — still references the connection; it
  revokes instead and tells the caller why deletion wasn't possible.
- **Revoking cascades a status change, not a deletion.** When a connection
  moves to `revoked` or `needs_reconnect`, every mapping referencing it
  (in either module) is marked `needs_reconnect` in the same operation — a
  mapping must never sit `active` while its underlying connection is
  revoked.
- **Reconnect invalidates stale caches.** After a successful reconnect (new
  tokens for an existing connection row) or a remapping (a new mapping row
  supersedes the old one), the owning module expires — not just lets age out
  — any report snapshot tied to the affected mapping, since property access
  or the underlying data can have changed and a stale-but-not-yet-expired
  snapshot would otherwise look authoritative. See Durable reporting state.
- **Retention**: connections, mappings (including superseded ones), report
  snapshots, and recommendations follow the retention periods in Date and
  retention semantics below. Deleting an organisation deletes all of the
  above for that organisation; nothing outlives the organisation record.

## Enabling database transactions

This plan's mapping-replacement ordering, connection-revocation cascades, and
refresh-lease acquisition all depend on genuine, atomic multi-statement
transactions. **This codebase currently disables them**:
`payload.config.ts`'s Postgres adapter is configured with
`transactionOptions: false`, which means every Payload local-API call today
runs as its own independent statement/commit, not as part of a caller-
controlled transaction. Building any of this plan's "single DB transaction"
steps on top of that setting would silently produce exactly the race
conditions the partial-unique-index design is meant to prevent — the two
statements would simply commit separately, with no atomicity between them.

Before any of the transactional mapping-replacement, revocation-cascade, or
refresh-lease work in Phase 1/2 is built, this plan requires:

- Re-enabling real transactions on the Postgres adapter (removing or
  correctly configuring `transactionOptions`), and auditing why they were
  disabled in the first place — if there was a specific bug or incompatibility
  that motivated `false`, it needs to be understood and either fixed or
  confirmed irrelevant to the code paths this plan adds, not just overridden.
- Verifying Payload's transaction API actually gives per-request atomicity
  under this app's request lifecycle (Next.js Server Actions and route
  handlers, including how a transaction is threaded through nested local-API
  calls via `req`) — read the current Payload database-transactions
  documentation before assuming an older mental model of how `req.transactionID`
  or equivalent is passed through still applies.
- Adding a regression test that exercises a genuine rollback (e.g. force the
  second statement in a mapping-replacement transaction to fail and assert
  the first statement's effect is not persisted) — a transaction wrapper that
  merely doesn't error under happy-path testing is not enough evidence it's
  providing real atomicity.
- Checking whether any *other* existing Payload operation in this codebase
  (outside this plan) implicitly relied on the old non-transactional
  behaviour before flipping the setting platform-wide, since this is a
  platform-level config change, not something scoped to
  `modules/google-connections/` alone.

Until this is done and verified, treat every "single transaction" step in
this plan as blocked, not merely as an implementation detail to fill in
during Phase 1.

## Mappings are capability-specific

Each module owns its own mapping collection — a future GTM container mapping
must never be forced into the same record as a Search Console or GA4
mapping, and Search Console/GA4 mappings must not be forced into one shared
record either, since they can be created, reconnected, and superseded on
independent timelines.

### `google-search-console-mappings` (module: `google-search-console`)

```text
organisation                  relationship to organisations
wordpressConnection            relationship to wordpress-connections
googleConnection                relationship to google-connections
searchConsolePropertyUrl        e.g. sc-domain:example.com or URL-prefix property
confirmedBy                     relationship to users
confirmedAt                     date
lastValidatedAt                 date
status                          active | needs_reconnect | needs_remapping | superseded
replacedAt                      date; set when a mapping is no longer active
replacedBy                      relationship to google-search-console-mappings; optional
```

### `google-analytics-mappings` (module: `google-analytics`)

```text
organisation                  relationship to organisations
wordpressConnection            relationship to wordpress-connections
googleConnection                 relationship to google-connections
ga4PropertyId                    GA4 property identifier
confirmedBy                      relationship to users
confirmedAt                      date
lastValidatedAt                  date
status                           active | needs_reconnect | needs_remapping | superseded
replacedAt                       date; set when a mapping is no longer active
replacedBy                       relationship to google-analytics-mappings; optional
```

Enforce in both collections that every referenced connection belongs to the
same organisation. Allow only one active mapping per WordPress connection
*within each collection* (a site can have one active Search Console mapping
and, independently, one active GA4 mapping) — enforced with a Postgres
partial unique index in each collection: `UNIQUE (wordpress_connection_id)
WHERE status = 'active'` (`CollectionConfig.indexes` with a `where` clause,
via a Payload migration), not an application-level "check then insert," which
allows two concurrent requests to both observe zero active mappings and both
insert one.

Replacing a mapping (agency change, Google account change, remapping) is a
single transactional operation, and **the order inside the transaction
matters**: supersede the previous active row first (`UPDATE ... SET status =
'superseded', replacedAt = now()`), then insert the new row as `active`,
both within the same DB transaction. Inserting the new active row before
superseding the old one would have two `active` rows for the same
`wordpress_connection_id` exist simultaneously inside the transaction, which
the partial unique index rejects outright — the whole point of the ordering
is that the index never sees two active rows at once, not even inside an
uncommitted transaction. Only after the supersede has been applied does the
insert of the new active row succeed; if either step fails, the transaction
rolls back and the prior mapping stays active and unchanged. Retain
superseded mappings as history but never use them for current reports. A GA4
property may legitimately be mapped to more than one WordPress site (an
agency's shared property across client sites), so `ga4PropertyId` must not be
made globally unique; the same is true of `searchConsolePropertyUrl`.

This — and every other "single DB transaction" claim in this plan (revocation
cascades, refresh-lease acquisition) — depends on Payload actually running
in a real transaction, which is not this codebase's current default; see
Enabling database transactions below.

## OAuth and setup flow

### Default reporting consent

Each module's connect flow requests only its own scope:

```text
google-search-console:  https://www.googleapis.com/auth/webmasters.readonly
google-analytics:       https://www.googleapis.com/auth/analytics.readonly
```

Epexta needs a registered Google OAuth client, configured callback URL, and
the relevant Google APIs enabled — one client is fine for both modules; the
requested scope, not the client, is what stays module-specific. Store refresh
tokens with the same encrypted-at-rest pattern used for WordPress
credentials. Never put tokens in URLs, logs, or MCP results.

### OAuth mechanics

- **State parameter:** `startAuthorization` (see the shared connections
  package above) generates an opaque, cryptographically random, single-use
  `state` value and persists it in `google-oauth-states` (short TTL, e.g. 10
  minutes) bound to the authenticated user ID, organisation ID, the
  initiating module slug (`capability`), and the intended flow (`connect` vs.
  `reconnect` for a specific connection doc ID). `handleCallback` looks up
  `state`, verifies it has not already been consumed, verifies the current
  session's user/organisation still matches, then deletes/invalidates it — a
  reused or unknown `state` is rejected outright, never silently retried.
- **PKCE:** generate a random `code_verifier` and its `code_challenge`
  (S256) per authorization attempt, store the verifier alongside the `state`
  record, and send it on the token exchange. Required regardless of whether
  the OAuth client is "confidential," since it also protects against
  authorization-code interception.
- **Callback error handling:** Google's callback can return `error`/
  `error_description` (user denied consent, invalid scope, etc.) instead of a
  `code`. Handle this as a normal, expected outcome — redirect back to the
  initiating module's connect/mapping page with a clear "connection not
  completed" message, not a server error page. Never log the full callback
  URL or query string (it can carry the authorization `code`); log only the
  outcome (success/denied/error code), the module slug, and the
  organisation/connection IDs.
- **Token logging:** access tokens, refresh tokens, and authorization codes
  must never appear in application logs, error reports, or tracing spans.
  Redact them at the HTTP-client layer used for the token exchange, not just
  at the call site.
- **Refresh rotation:** Google returns a refresh token only on the *first*
  consent grant for a given client/user/scope combination unless
  `prompt=consent&access_type=offline` is forced on every authorization
  request — always pass both, so reconnect flows reliably get a fresh refresh
  token rather than silently keeping a stale/absent one. If Google does not
  return a refresh token on a given exchange, keep the connection's existing
  encrypted refresh token rather than overwriting it with nothing, and update
  `lastValidatedAt` from the new access token's validity instead. If a
  refresh call itself fails with `invalid_grant` (token revoked from the
  Google side), mark the connection `needs_reconnect` immediately rather than
  retrying.

### Mapping wizard (per module)

Each module runs its own wizard against its own mapping collection:

1. The organisation admin selects an existing WordPress connection.
2. Via `modules/google-connections`'s `listConnectionsForCapability`, they
   pick an existing connection whose `scopeProfile` already matches this
   module, or call `startAuthorization` for a new Google account scoped to
   exactly that requirement.
3. Epexta retrieves the properties (Search Console properties, or GA4
   properties) accessible to that Google account, for this module only.
4. Epexta may label a likely match using the WordPress site's hostname, but
   no Google property is selected automatically.
5. The admin explicitly chooses one property for this module.
6. Epexta validates the selection with a small read-only request and displays
   the selected property label and any access issue.
7. The admin confirms and saves the mapping into that module's own
   collection.

When an MCP tool receives a WordPress `siteId`, it must first resolve the
WordPress connection using the existing fail-closed site-selection mechanism.
It then loads only the active mapping for that exact connection *from its own
module's mapping collection*. A missing or invalid mapping returns a
setup-required response scoped to that module; it must never fall back to
another site's mapping, and a Search Console tool must never read the
Analytics mapping collection or vice versa.

## When a property is missing

Many sites will already be registered under a Google account, but not always
under the account the user connected to Epexta. Each module's UI provides
these paths:

- **Try another Google account:** reconnect with the account that owns the
  property (subject to the immutable-scope rule above — reconnecting means
  authorizing a connection with this module's scope, not broadening an
  existing one).
- **Ask an owner for access:** show the required access level for this
  module and let the user retry discovery afterward.
- **Set up the property:** open a guided checklist for adding a Search
  Console property or a GA4 property and completing Google's own setup for
  it.
- **Refresh properties:** repeat discovery after the user has completed
  setup.

Neither module creates Search Console or GA4 properties, installs Google
tags, or completes Google's ownership verification. Search Console
verification can require DNS, a root HTML file, or a verification meta tag,
which Epexta cannot safely install through a generic WordPress credential
without a purpose-built helper — see Future Google Site Hub modules below.

## Reporting model

### Google Search Console module

- clicks, impressions, click-through rate, and average position;
- query, page, device, country, and date breakdowns;
- index status where available (`check_post_indexing`, via the URL Inspection
  endpoint against the mapped property; returns an explicit "unavailable"
  result, not an error, when access or coverage does not permit inspection).

Search Console is the primary source for content-improvement signals and
owns `list_content_opportunities` and `propose_post_improvements` (see
Cross-module composition below for how these optionally enrich with GA4 data).

### Google Analytics module

- users and sessions;
- engagement measures;
- configured key events/conversions;
- channel or referral context where meaningful.

Both modules' reports must carry their date range, source, timezone where
applicable, and a clear freshness/incompleteness note. Search Console
responses can be delayed, incomplete for recent dates, and limited to top
returned rows; recommendations must communicate this rather than overstate
certainty.

### Cross-module composition

Because Search Console and Analytics are now separate modules with separate
entitlements, `propose_post_improvements` and `list_content_opportunities`
(owned by `google-search-console`) must not reach into
`modules/google-analytics/`'s Payload collections or internal client
directly — that would recreate the exact cross-module coupling the split was
meant to avoid, and would break if a customer has Search Console enabled
without Analytics.

Instead, `modules/google-analytics/` exports one narrow, read-only function
from its own public module surface, `modules/google-analytics/index.ts`'s
`getEngagementSummaryForPost`. Its input is deliberately minimal and
never a decrypted secret or another module's internal object:

```text
getEngagementSummaryForPost({ requesterUserId, wordpressConnectionId, wordpressPostId, dateRange })
```

It takes a `wordpressPostId`, not a caller-provided canonical URL. Accepting
an arbitrary URL through this public surface would make "post performance"
ambiguous (which post does that URL actually belong to? does it match the
mapped site at all?) and would let a caller drive an arbitrary GA4 query by
URL rather than a specific, resolvable WordPress post — effectively
reopening the function as a generic URL-report endpoint. Instead,
`getEngagementSummaryForPost` calls the shared, read-only
`getPostForPerformance(connection, postId)` resolver (see Post-identity
resolution below) internally to derive the canonical URL itself from
`wordpressConnectionId` + `wordpressPostId`, so the caller can only ever ask
"how did *this specific post* perform," never "run this query against this
URL."

It never accepts a WordPress connection object, an organisation ID supplied
by the caller, or any Google credential — it takes only `requesterUserId`,
`wordpressConnectionId`, and `wordpressPostId`, and derives and verifies the
organisation itself (looking up the WordPress connection's own organisation
and confirming `requesterUserId` belongs to it, the same fail-closed pattern
used everywhere else) rather than trusting a caller-supplied organisation ID
or a caller-supplied "trust me, this connection belongs to this org" object.
This also means the function's own entitlement/mapping checks cannot be
bypassed by a caller that skipped them, and it never leaks decrypted Google
Analytics tokens across the module boundary — only `modules/google-connections`
ever sees those (via `executeGoogleApiRequest`).

Its return value is a typed, discriminated result — never a bare `null`, which
would collapse several genuinely different situations into one
indistinguishable "no data" case:

```text
{ status: "ok", data: EngagementSummary }
| { status: "not_entitled" }       // organisation lacks the google-analytics entitlement
| { status: "not_mapped" }         // entitled, but no active mapping for this WordPress site
| { status: "consent_expired" }    // mapping exists but the connection needs_reconnect
| { status: "temporary_failure" }  // GA4 call failed transiently (quota, network) — retry later
```

`google-search-console`'s recommendation tools call this function to enrich
evidence when it returns `status: "ok"`, and fall back to Search-Console-only
evidence — clearly labelled with *which* of the above reasons applied, e.g.
"Analytics not connected" vs. "Analytics temporarily unavailable" — for every
other status. None of the non-`"ok"` statuses are ever surfaced as an error to
the caller; they're all expected, distinguishable outcomes. This keeps the
dependency one-directional (Search Console may optionally read Analytics's
public surface; Analytics never depends on Search Console) and keeps each
module's entitlement check fully self-contained.

### Durable reporting state

Use a small cache/snapshot layer backed by a dedicated Payload collection per
module (`google-search-console-report-snapshots`,
`google-analytics-report-snapshots`), not an in-memory cache — an in-memory
cache gives no predictable behaviour across Vercel's multiple function
instances/deployments. Fields (shared shape, one collection per module so
each module's data stays independently owned and cleanable):

```text
mapping                       relationship to that module's own mappings collection
reportType                    e.g. post_performance | compare_periods | search_queries | index_status
canonicalPostUrl               normalised, matches the resolver's canonical link
normalizedQueryParams           canonicalised query-string used for matching, or null
dateRangeStart / dateRangeEnd   date
timezone                        IANA timezone used for the range
fetchedAt                       date
expiresAt                       date
freshnessState                  fresh | stale | delayed | unavailable
payload                         normalised report JSON (metrics/evidence only — no tokens)
```

Index on `(mapping, reportType, canonicalPostUrl, normalizedQueryParams,
dateRangeStart, dateRangeEnd)` for lookup. Expire/evict by `expiresAt` (a
scheduled cleanup job, not unbounded growth); never cache tokens or raw
Google request/response bodies containing anything beyond the normalised
metrics. Do not build continuous polling in the initial release.

### Distributed, race-safe refresh deduplication

A lookup index on the snapshot collection prevents *storing* duplicates, but
it does not stop two concurrent requests on two different Vercel instances
from both missing the cache and both calling Google for the same report at
the same moment. Add a `report-refresh-leases` collection per module (same
key shape as the snapshot lookup: `mapping, reportType, canonicalPostUrl,
normalizedQueryParams, dateRangeStart, dateRangeEnd`), with a database
**unique constraint** on that key plus `leaseHolder` (a request/instance ID)
and `leaseExpiresAt` (a short TTL, e.g. 30 seconds):

- To refresh a report, a caller attempts an atomic insert-if-not-exists on
  the lease's unique key (a single `INSERT ... ON CONFLICT DO NOTHING`-style
  operation, not a separate `find` then `insert`, which reopens the same
  race). If the insert succeeds, that caller holds the lease: it calls
  Google, writes the new snapshot, then deletes the lease.
- If the insert fails (a lease already exists and hasn't expired), the caller
  is not the lease holder: it returns the existing snapshot (even if stale)
  with a `refresh-pending` freshness note, rather than calling Google itself
  or blocking.
- A lease past `leaseExpiresAt` is treated as abandoned (the holder's request
  crashed or timed out) and the next caller's insert-if-not-exists succeeds
  once the expired row is cleaned up or the insert logic explicitly allows
  replacing an expired lease.

This is the mechanism that actually deduplicates concurrent refreshes across
instances; the snapshot lookup index above is for correctness of what's
stored, not for coordinating who's allowed to fetch.

### Quota policy

Each module's reporting client applies its own explicit quota policy, backed
by its own durable quota-usage collection (or equivalent counters table)
keyed by `(organisation, wordpressConnection, windowStart)` — not
process-local counters, which reset on every deploy/cold start and are
inconsistent across concurrent instances:

- deduplicate identical in-flight requests via the lease mechanism above and
  serve a cached result whenever the snapshot remains fresh;
- rate-limit requests by organisation and WordPress site, reading/
  incrementing the durable counter so limits hold across instances and
  deployments;
- use bounded exponential backoff for temporary Google API failures or quota
  responses, never an unbounded retry loop;
- defer non-urgent refreshes when a quota is reached, preserving the last
  known result with its timestamp; and
- return a clear refresh-pending state to the UI/MCP client rather than
  hiding quota errors or retrying aggressively.

### GA4's quota boundary is per-property, per-project, and per-organisation — all three, not one

`google-analytics`'s org+site-keyed quota counter above is necessary but not
sufficient: [Google enforces GA4 Data API quotas both per GA4 property and,
separately, per (property, Google Cloud project) pair](https://developers.google.com/analytics/devguides/reporting/data/v1/quotas)
— concurrent requests and tokens per hour/day are tracked at each of those
two boundaries independently — regardless of which Epexta organisation is
asking. And a GA4 property can be mapped by more than one Epexta organisation
(the agency case already in the mapping model), so two different
organisations' requests can draw down the *same* property's quota without
either organisation's own counter reflecting that.

These are two genuinely separate budgets, and a single collection keyed by
the compound pair cannot represent both: a `(ga4PropertyId,
googleCloudProjectId)`-keyed row only ever tells you about usage from *one*
project against that property, so it cannot coordinate the property-wide
budget (which Google enforces across *all* projects hitting that property)
if Epexta ever calls that property from more than one Google Cloud project —
a single-project deployment happens to make the two budgets numerically
identical today, but the collection shape would already be wrong the moment
a second project existed, and that's a data-model problem, not just a
today-vs-future detail. Use two separate durable records instead:

- **`ga4PropertyQuota`**, keyed by `ga4PropertyId` alone — the property-wide
  budget, shared by every Google Cloud project (Epexta's own, and in
  principle any other) that calls this property.
- **`ga4ProjectPropertyQuota`**, keyed by the compound
  `(ga4PropertyId, googleCloudProjectId)` — the budget specific to Epexta's
  own project's usage of this property. `googleCloudProjectId` is Epexta's
  own OAuth client's project (a fixed, known value, not something read
  per-request); a single-project deployment populates exactly one project ID
  per property here, and the shape stays correct without any migration if a
  future deployment adds a second project.

Both collections are keyed by property (and property+project) alone — never
by organisation — and both are populated from GA4's own `returnPropertyQuota`
field on each `runReport` response (request it explicitly), storing the most
recently observed `tokensRemaining`/`tokensPerHour`/`tokensPerDay`/
`concurrentRequests` values and `lastObservedAt`, rather than estimating
consumption independently. Keep the organisation-level counter as a fully
separate, third check for fairness between organisations sharing a property —
it is not a substitute for either quota collection and vice versa. Before
issuing a request for a mapping, check all three: the organisation-level
counter, `ga4PropertyQuota`, and `ga4ProjectPropertyQuota`; defer if any is
near budget. Because both quota collections store only numeric state keyed
by property/project IDs — never report data, mappings, or organisation
identifiers — one organisation using a shared property cannot learn anything
about another organisation's usage of it beyond "this property's quota is
currently tight," which is already true of the property regardless of
Epexta.

### Post-identity resolution

The existing WordPress client (`modules/wordpress/client.ts`) exposes a post
title lookup by ID but no single-post canonical-URL read method for arbitrary
posts. Add a read-only resolver — e.g. `getPostForPerformance(connection,
postId)` — that returns `{ postId, canonicalLink, status, modifiedAt }` from
the WordPress REST API's own post `link` field (already the canonical URL
WordPress serves), without granting either Google Site Hub module any write
capability on posts. This resolver is shared platform-adjacent read
infrastructure, not specific to either module — it lives in
`modules/wordpress/` (read path only) and both `google-search-console` and
`google-analytics` call it independently.

### GA4 cross-site filtering

A single GA4 property can legitimately serve multiple domains (the mapping
model already allows one GA4 property to map to several WordPress sites). Use
[GA4's own documented dimensions](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema)
for the match, rather than inventing a URL comparison: filter by the
`hostName` dimension equal to the mapped WordPress site's canonical hostname
**and** `pagePathPlusQueryString` equal to the post's canonical path (plus
query string when the site's canonical identity depends on it) — or,
equivalently, an exact-match filter on the combined `pageLocation` dimension
when that's a cleaner single-dimension expression for the query being built.
Filtering by path alone risks pulling in data from an unrelated domain served
by the same property. Record which dimension(s) and match rule were applied
in the report's evidence output so a user can see exactly what was matched,
not just the resulting numbers.

## MCP tools

```text
app/api/google/mcp/route.ts   (both modules' tools, each gated on its own slug)
```

| Module | Phase | Tool | Purpose |
| --- | --- | --- | --- |
| google-search-console | 2 | `get_search_console_performance` | Report Search Console metrics for a selected WordPress post. |
| google-search-console | 2 | `compare_search_console_periods` | Compare two equal periods, such as the latest 28 days versus the previous 28. |
| google-analytics | 2 | `get_analytics_performance` | Report mapped GA4 metrics for a selected WordPress post. |
| google-analytics | 2 | `compare_analytics_periods` | Compare two equal periods for GA4 metrics. |
| google-search-console | 3 | `list_content_opportunities` | Rank posts with evidence-backed opportunities for a selected site; enriched with GA4 evidence when `google-analytics` is enabled and mapped for that site (see Cross-module composition). |
| google-search-console | 3 | `get_search_queries_for_post` | Show the leading queries and associated page metrics for one post. |
| google-search-console | 3 | `check_post_indexing` | Report available index-status information for the selected post URL. |
| google-search-console | 3 | `propose_post_improvements` | Produce recommendations and proposed edits; does not update WordPress. |

Every site-specific tool follows this order:

```text
resolve WordPress site -> load exact mapping for this module -> fetch/cache report ->
return metrics, evidence, limitations, and next action
```

Tool descriptions explain input and output mechanics. Access control and
required site selection remain deterministic server checks, not model
instructions.

## Improvement workflow

The product loop is:

```text
Measure -> explain -> propose -> user approves -> update WordPress -> measure again
```

Examples of rules for `list_content_opportunities`:

| Evidence | Suggested improvement |
| --- | --- |
| High impressions and low CTR | Improve title and meta description. |
| Strong impressions around positions 8–20 | Expand the section that best matches the relevant query intent. |
| Declining clicks over comparable periods | Refresh time-sensitive facts, examples, structure, and internal links. |
| Strong visits but weak engagement (requires `google-analytics` enrichment) | Clarify the opening and better satisfy the likely search intent. |
| Good engagement but few impressions (requires `google-analytics` enrichment) | Improve coverage, internal linking, and search-facing metadata. |

A recommendation includes:

- the exact post and canonical URL;
- source metrics, comparison period, and data freshness, labelled by which
  module(s) contributed evidence;
- the observed pattern and uncertainty;
- the proposed title, metadata, content, or internal-linking change;
- a preview of the WordPress edit when relevant.

`propose_post_improvements` must not call `update_post`. The user may review
the proposal and separately ask the existing WordPress workflow to apply the
chosen changes. Store a baseline snapshot before an approved refresh so a
later report can compare performance without claiming causation.

### Recommendation/baseline record

A separate `update_post` call has no inherent link back to the recommendation
it fulfils, which makes later comparison impossible unless that link is
captured explicitly. Add a `google-search-console-recommendations`
collection (owned by that module, since it's the one producing
recommendations):

```text
organisation                  relationship to organisations
mapping                       relationship to google-search-console-mappings
wordpressPostId                the post the recommendation targets
canonicalPostUrl               at the time the recommendation was generated
preEditPostVersionHash          hash/version marker of the post content at generation time
baselineSearchConsoleSnapshot   relationship to google-search-console-report-snapshots; required
baselineAnalyticsSnapshot       relationship to google-analytics-report-snapshots; optional —
                                 present only when GA4 evidence contributed to this recommendation
proposedChange                  the recommendation content (title/meta/content/links)
status                          proposed | approved | applied | dismissed
approvedBy / approvedAt         relationship to users / date
appliedAt                       date; set via an explicit "mark applied" action
                                 (a Server Action a user triggers after the
                                 WordPress edit lands, or a hand-off field the
                                 WordPress update flow sets when it can identify
                                 the source recommendation) — never inferred
                                 automatically from an unrelated update_post call
```

Two separate relationship fields, not one polymorphic
`baselineReportSnapshot` pointing at "whichever snapshot collection," because
a single field would need its own `relationTo` discriminator to know which
collection it points into, which Payload relationship fields don't give you
cleanly, and would make "GA4 evidence contributed or not" implicit in
whether a discriminator happens to be set rather than an explicit, always-
present distinction between a required Search Console baseline and an
optional Analytics one.

This preserves the no-automatic-write rule (the record only stores a proposal
and, later, a marker) while giving Phase 4 a defensible, explicit link between
a recommendation, the edit that addressed it, and the baseline to compare
against — without requiring `update_post` itself to know anything about
either Google Site Hub module.

## Date and retention semantics

- **Timezone per source, not one global convention.** Search Console's
  Search Analytics data is reported in Pacific Time (America/Los_Angeles)
  regardless of the property's own configured timezone — a date range
  requested in the organisation's local time must be translated to Pacific
  Time boundaries before querying, and the report's `timezone` field records
  `America/Los_Angeles` for Search Console snapshots specifically. GA4 report
  dates follow the GA4 property's own configured reporting timezone (read
  from the Admin API at mapping time and stored on the mapping, since a
  property's timezone can change), and the report's `timezone` field records
  that property's timezone for Analytics snapshots. Never assume the two
  sources share a timezone when combining evidence in a single
  recommendation — state each source's own timezone explicitly.
- **Default report windows**: `get_search_console_performance` and
  `get_analytics_performance` default to the trailing 28 days when no date
  range is given; `compare_*_periods` defaults to the latest 28 days versus
  the previous 28. Both are explicit tool parameters an MCP caller can
  override, not hidden defaults.
- **Snapshot retention**: report snapshots (both modules) are retained for
  90 days from `fetchedAt`, then evicted by the scheduled cleanup job
  mentioned under Durable reporting state. A snapshot referenced by a
  `google-search-console-recommendations` row as its baseline is retained
  for as long as that recommendation row exists, overriding the 90-day
  default — a recommendation must never end up pointing at an evicted
  baseline.
- **Recommendation retention**: recommendation rows are retained indefinitely
  by default (they're small, auditable, and low-volume) unless the
  organisation is deleted, at which point they're deleted with it.
- **Historical reports after a mapping is superseded**: a superseded
  mapping's own snapshots and any recommendations built from them remain
  readable as history (the mapping row itself is retained, per Mappings are
  capability-specific above) — the UI must label them clearly as referring
  to a no-longer-active mapping rather than presenting them as current.
- **Organisation deletion**: deleting an organisation cascades to both
  modules' connections (via `modules/google-connections`), mappings, report
  snapshots, quota-usage records, and recommendations for that organisation.
  Property-level GA4 quota records are keyed by property, not organisation,
  and are never deleted as a side effect of one organisation's deletion.

## Delivery phases

### Phase 1 — Shared connections, Google connections, and explicit mappings (both modules)

- **Enable and verify real database transactions first** — flip
  `payload.config.ts`'s Postgres adapter off `transactionOptions: false`,
  understand and resolve whatever motivated disabling them, and add the
  forced-rollback regression test described under Enabling database
  transactions. Nothing else in this phase that claims transactional
  behaviour (mapping replacement, revocation cascades, refresh leases) can
  be considered done until this lands and is verified — treat it as a
  blocking prerequisite task, not parallel work.
- Build `modules/google-connections/`: the `google-connections` and
  `google-oauth-states` collections, field-level token redaction, collection
  `access` rules that return `false` for every ordinary request on every
  operational collection (not just credential fields), the
  `startAuthorization`/`handleCallback`/`executeGoogleApiRequest`/
  `revokeConnection`/`disconnectOrDelete` public interface (including the
  per-`capability` method+URL-pattern allowlist `executeGoogleApiRequest`
  validates against), scope-profile validation against Google's actual
  grant, and the reference-check hooks
  the two consuming modules register for deletion blocking. This ships
  before either consuming module's own UI, since both depend on it.
- Register `google-search-console` and `google-analytics` in `lib/modules.ts`
  (with `group: "google-site-hub"`) and add their entitlement migrations
  (disabled by default for existing and new organisations).
- Build both modules' own collections (including the partial-unique-index
  migrations for each mapping collection), admin-only connection UI (backed
  by `modules/google-connections`), and connection-health status.
- Discover Search Console properties (in `google-search-console`) and GA4
  properties (in `google-analytics`), independently.
- Build each module's own explicit mapping wizard, validation call, and
  remapping/reconnect states, using the transactional replace operation for
  active mappings — supersede-then-insert, in that order, inside one
  transaction.
- Wire entitlement gating into every page and Server Action from the start
  for both modules, per the checklist above.
- Generate and commit the Payload migrations for every new collection/index.
- Add tests: organisation scoping and rejection of cross-organisation IDs for
  both modules; OAuth state replay/expiry/mismatch (including mismatched
  initiating module); callback error handling; concurrent mapping-replacement
  race per mapping collection; immutable-scope enforcement (a module's
  connect flow never broadens an existing connection's `grantedScopes`);
  scope-profile rejection when Google's returned grant is broader than the
  requested profile; token field-level access returning nothing through
  Payload's REST/GraphQL/admin surfaces for every role including
  organisation admin; connection deletion blocked while referenced by any
  mapping, and revoke cascading `needs_reconnect` to dependent mappings in
  both modules; entitlement-disabled behaviour for pages and actions in both
  modules independently (one enabled without the other, and neither
  enabled).

### Phase 2 — Read-only post reporting (both modules)

- Implement the Search Console client (`google-search-console`) and GA4
  client (`google-analytics`), and the shared read-only WordPress
  post-identity resolver (`getPostForPerformance`).
- Add report normalisation, each module's own durable snapshot/quota
  collections, and a basic performance page per module.
- Add `get_search_console_performance`/`compare_search_console_periods` to
  `google-search-console` and `get_analytics_performance`/
  `compare_analytics_periods` to `google-analytics`, each gated through
  `registerGatedTool` on its own MCP route.
- Test no mapping, expired consent, inaccessible property, mismatched site,
  and multi-site selection behaviour for both modules; GA4 `hostName`/
  `pagePathPlusQueryString` filtering against a multi-domain property
  (mocked); cached/rate-limited/quota-deferred/temporary-failure states
  against a mocked Google API for both modules; the refresh-lease's
  concurrent-insert race (two simulated concurrent requests for the same
  report key, only one calls the mocked Google API) and lease-expiry
  recovery; reconnect/remapping invalidating the affected mapping's
  snapshots.

### Phase 3 — Opportunities and recommendations (google-search-console, optionally enriched by google-analytics)

- Add page/query analysis, opportunity ranking, evidence cards, and index
  checks in `google-search-console`.
- Add the narrow `getEngagementSummaryForPost` export to `google-analytics`
  for cross-module enrichment, self-contained with its own entitlement/
  mapping check.
- Add `list_content_opportunities`, `get_search_queries_for_post`,
  `check_post_indexing`, and `propose_post_improvements` to
  `google-search-console`.
- Calibrate thresholds with real, anonymised examples and clearly label weak,
  incomplete, or Search-Console-only (no Analytics enrichment) evidence.
- Test the enrichment fallback explicitly: Analytics enabled + mapped,
  Analytics enabled + not mapped for this site, and Analytics not entitled at
  all — all three must degrade to correct, clearly-labelled evidence rather
  than erroring.

### Phase 4 — Reviewed refresh measurement (google-search-console)

- Add the `google-search-console-recommendations` collection and its "mark
  applied" action/hand-off field.
- Save baseline snapshots when users choose to refresh a post.
- Link an approved WordPress edit to its recommendation and baseline via that
  record — never inferred automatically from an unrelated `update_post` call.
- Surface a later comparison after a suitable observation window.
- Keep the assessment descriptive: performance can be influenced by many
  factors beyond the edit.
- Test the full recommendation lifecycle (proposed → approved → applied →
  compared) and that a dismissed/unapplied recommendation never produces a
  comparison.

## Future Google Site Hub modules (not built in this plan)

Documented now so the module boundary doesn't need revisiting later, but
deliberately not implemented until each becomes a real, separately-justified
piece of work:

| Module | What it would enable | Risk level |
| --- | --- | --- |
| `google-pagespeed` | PageSpeed/Core Web Vitals diagnostics for a mapped site | Read-only |
| `google-tag-manager` | Container/tag health, then separately-approved container setup/publishing | Sitewide writes |
| `google-site-setup` | Search Console ownership verification and sitewide tag installation | Sitewide writes; likely needs a purpose-built Epexta WordPress helper plugin for safe sitewide changes |
| Monetisation (Ads/AdSense/Reader Revenue) | Only if it becomes a deliberate commercial product area | Commercial/configuration writes |

Each, when built, gets its own registry slug under `group: "google-site-hub"`,
its own entitlement, and — for the two that need sitewide writes — its own
explicit security review before any write capability ships; neither
`google-search-console` nor `google-analytics` should be extended to absorb
these responsibilities instead of registering the dedicated module.

## Non-goals for this plan

- Automatically mapping a WordPress site to a Google property.
- Automatically editing, publishing, deleting, or submitting WordPress posts.
- Creating Google accounts, Search Console properties, or Search Console
  ownership verification through Epexta.
- Creating GA4 properties or installing Google tags through Epexta.
- Real-time monitoring or high-frequency polling.
- Claiming that an edit caused a ranking or conversion change.
- Any Tag Manager, Site Setup, PageSpeed, or monetisation capability — see
  Future Google Site Hub modules above.

## Verification checklist

- A user from organisation A cannot list, map, or report on organisation B's
  Google connection or WordPress site, in either module.
- A multi-site organisation is prompted to select the relevant WordPress site;
  the server rejects ambiguous or invalid selections.
- A saved mapping can only reference connections in the same organisation,
  within its own module's mapping collection.
- Two organisations connecting the same Google account retain separate
  connection records and cannot access each other's mappings or report data.
- A WordPress site has only one active mapping *per module*, enforced by each
  collection's own database partial unique index, even under concurrent
  mapping-replacement requests; superseded mappings remain auditable but are
  never used for current reports.
- A `google-connections` row's `grantedScopes` is never broadened after
  creation; a module needing a different scope always authorizes a new
  connection, and `handleCallback` rejects a token exchange whose returned
  grant is broader than the requested `scopeProfile` rather than persisting
  it.
- Token fields (`accessToken`, `refreshToken`) are unreadable through
  Payload's REST, GraphQL, and admin-panel surfaces for every caller,
  including an organisation admin — decrypted values exist only inside
  `modules/google-connections`'s own server-side functions.
- `modules/google-connections` is the only place OAuth/secret-handling logic
  lives; neither `google-search-console` nor `google-analytics` implements
  its own token exchange, refresh, or state storage.
- `executeGoogleApiRequest` and `getConnectionForCapability` refuse to
  execute the request / return anything when the caller's `capability`
  doesn't match the connection's stored `scopeProfile`, even given a valid
  connection ID; `executeGoogleApiRequest` separately refuses any request
  whose `{ method, url }` isn't an exact match against that capability's
  fixed method+URL-pattern allowlist.
- A connection cannot be hard-deleted while any mapping (active or
  superseded, in either module) still references it; revoking a connection
  cascades `needs_reconnect` to every dependent mapping in the same
  operation.
- Reconnecting a connection or replacing a mapping invalidates (not just lets
  age out) that mapping's existing report snapshots.
- Reauthentication and revoked-consent states are clear and recoverable, per
  module.
- OAuth `state` is single-use, expires, and is bound to the initiating
  user/organisation/module/flow; a reused or mismatched `state` is rejected.
  PKCE is used on every authorization request. Callback denial/error is
  handled as a normal outcome, not a server error.
- Tokens, authorization codes, and callback query strings never appear in
  rendered pages, URLs, client bundles, logs, tracing spans, or MCP responses.
- Read-only reporting requests use only read-only scopes; no identity/email
  scope is requested for reporting.
- `getEngagementSummaryForPost` derives and verifies the organisation itself
  from `requesterUserId` + `wordpressConnectionId` rather than trusting a
  caller-supplied organisation ID or connection object, resolves its
  canonical URL internally from `wordpressPostId` rather than accepting a
  caller-provided URL (a raw URL parameter must be rejected/absent from its
  signature entirely, not merely unvalidated), and its result is always one
  of the typed statuses (`ok`/`not_entitled`/`not_mapped`/
  `consent_expired`/`temporary_failure`) — never a bare `null` that collapses
  those cases.
- `executeGoogleApiRequest`'s design means no consuming module's code ever
  receives a raw access token string in any form — verified by confirming
  there is no code path in either module (or in any function/closure either
  module passes to `modules/google-connections`) that stores, logs, or
  returns a Google access token; the only argument either module ever
  supplies is a plain request description (URL/method/body), never a
  function that would execute with the token in scope.
- `executeGoogleApiRequest` rejects a request that doesn't exactly match one
  of the calling capability's allowlisted `(method, URL pattern)` entries —
  verified with tests covering: a disallowed host per capability (e.g.
  `google-analytics` attempting `analyticsadmin.googleapis.com`'s account-
  deletion or property-creation routes, not just an unrelated host), the
  right method required per entry (e.g. a `DELETE` against an otherwise-
  allowlisted `GET` route is rejected), and confirming every currently-planned
  feature's actual outbound call (`searchAnalytics/query`, `urlInspection/
  index:inspect`, `runReport`, `accountSummaries`, and the single-property
  Admin lookup) succeeds against the allowlist as specified above.
- A GA4 report for a post only includes traffic matching that post's mapped
  `hostName` and `pagePathPlusQueryString` (not path alone), verified against
  a mocked multi-domain GA4 property.
- Two concurrent requests for the same report key never both call the live
  Google API — the refresh-lease's unique-constraint insert lets exactly one
  through, verified with a simulated concurrent-request test, not just
  inspected by reading the code.
- Database transactions are genuinely enabled (`transactionOptions` is no
  longer `false` in `payload.config.ts`) and a forced-rollback test confirms
  a mapping-replacement transaction's first statement does not persist if
  its second statement fails — not just that the happy path doesn't error.
- Cached, rate-limited, quota-deferred, and temporary Google API failure
  states are backed by durable (not in-memory/per-instance) state, tested,
  and clearly surfaced to users, independently per module.
- `google-analytics`'s quota model checks all three layers before issuing a
  request — the organisation-level fairness counter, `ga4PropertyQuota`
  (keyed by `ga4PropertyId` alone, the property-wide budget), and
  `ga4ProjectPropertyQuota` (keyed by the compound `(ga4PropertyId,
  googleCloudProjectId)` pair, this project's budget against that property) —
  and none of the three substitutes for another; none of the three exposes
  report data, mappings, or another organisation's identity — verified by
  confirming their rows carry only numeric quota fields.
- Every operational collection this plan adds — OAuth states, refresh
  leases, quota counters (organisation-, property-, and project-level), and
  both modules' report snapshots — has collection-level `access` rules that
  return `false` for every ordinary Payload REST/GraphQL/admin request; none
  of them are reachable except through their owning module's own
  server-side code using `overrideAccess: true`.
- `google-search-console`'s cross-module enrichment never breaks when
  `google-analytics` is disabled, unmapped, or its own reporting call fails —
  it degrades to Search-Console-only evidence, clearly labelled with which
  typed status applied.
- Every recommendation has a source, a date range, and a limitation/freshness
  statement, always has a `baselineSearchConsoleSnapshot`, and has a
  `baselineAnalyticsSnapshot` only when Analytics evidence actually
  contributed; every applied recommendation is traceable to its baseline
  snapshot(s) via the `google-search-console-recommendations` record.
- Search Console snapshots record `America/Los_Angeles` as their timezone
  regardless of the organisation's own timezone; GA4 snapshots record the
  mapped property's configured timezone.
- A superseded mapping's snapshots and recommendations remain readable and
  are clearly labelled as historical, not current.
- Deleting an organisation removes both modules' connections, mappings,
  snapshots, quota-usage records, and recommendations for that organisation,
  and leaves property-level GA4 quota records (keyed by property, not
  organisation) untouched.
- Every page under each module's own `overviewPath`/`connectPath`, every
  Server Action, and every MCP tool correctly renders/returns a not-enabled
  state when the organisation lacks that specific module's entitlement — and
  an organisation with one Google Site Hub module enabled and the other
  disabled sees exactly that split reflected everywhere.
- Payload migrations for every new collection and index are generated and
  committed; `git diff --check`, typecheck, lint, knip, and build pass before
  release.

## References

- Google Search Console API: <https://developers.google.com/webmaster-tools>
- Search Analytics query: <https://developers.google.com/webmaster-tools/v1/searchanalytics/query>
- Search Console URL Inspection (`urlInspection/index:inspect`, on `searchconsole.googleapis.com`, distinct from the Webmasters v3 host): <https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect>
- Search Console ownership verification: <https://developers.google.com/site-verification/v1/getting_started>
- Google Analytics Data API reporting: <https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1alpha/properties/runReport>
- Google Analytics Admin API: <https://developers.google.com/analytics/devguides/config/admin/v1>
- Google Analytics Data API quotas (`returnPropertyQuota`, per-property/per-project limits): <https://developers.google.com/analytics/devguides/reporting/data/v1/quotas>
- Google Analytics Data API dimensions/metrics schema (`hostName`, `pagePathPlusQueryString`, `pageLocation`): <https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema>
