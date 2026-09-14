# Plan: Building a WordPress Publishing Plugin for ChatGPT

Competitors: **WPVibe** and **WPAgent** — both offer ChatGPT/AI-assistant integrations for publishing to WordPress. Use them as reference points for feature parity and differentiation as this plan progresses.

A phased plan to go from idea to a live, discoverable ChatGPT plugin (similar to WPVibe / WP Agent) — structured so each phase produces something testable before investing in the next.

## Phase 1 — Scope & Key Decisions

Decide these before writing any code, since they shape everything downstream.

- **Single-site vs multi-tenant**: Just your own WP site, or will other users connect their sites? (Assume multi-tenant if building for other users.)
- **Auth model per user**:
  - WordPress Application Passwords — simplest, user pastes a token, works for any self-hosted WP site
  - Full OAuth — better UX, more setup, realistically only clean if targeting WordPress.com or building your own WP-side OAuth plugin
- **Free vs paid**: ChatGPT plugins cannot sell subscriptions/credits inside the plugin itself. Decide now whether this is free, or paid via your own site with the plugin checking plan status externally.

## Phase 2 — MVP Build

Goal: working for yourself in Developer Mode.

Core tools to expose (smallest useful set first):

- `list_posts` — read-only, safe to test first
- `create_post` (draft only, not published)
- `publish_post`
- `upload_media` (needed for featured images)

Stack suggestion: Next.js on Vercel with `mcp-handler` (handles the 2026-07-28 stateless MCP spec natively), or a plain Node/Python service on Fly.io/Railway if you'd rather avoid Next.js.

Data layer: a `connections` table (`user_id`, `site_url`, `encrypted_credential`, `created_at`). Encrypt credentials at rest from day one — don't bolt this on later.

**Milestone**: you can add your server URL in ChatGPT Developer Mode and successfully draft + publish a post on your own WP site.

## Phase 3 — Multi-Tenancy & Real Auth

- Add sign-up/login to your own backend (separate from WP auth) so each ChatGPT user has an identity tied to their stored WP credentials
- Build the "connect your WordPress site" flow — a simple form for site URL + Application Password is the fastest path to ship
- Add per-tool authorization checks so one user's session can never touch another user's site

**Milestone**: a second person (friend, beta tester) can connect their own WP site and use the tools without you touching any config.

## Phase 4 — Hardening for Review

- Test every tool against edge cases: invalid credentials, unreachable site, huge content, malformed HTML, rate limits
- Add input validation/sanitization on anything written into `create_post` — matters both for review approval and for protecting users from prompt-injection-driven bad writes
- Set up a dedicated demo WordPress site + demo account with sample data (a hard requirement for submission — reviewers won't sign up for a real account)
- Write clear tool descriptions and a few sample prompts/expected responses — reviewers use these to test

## Phase 5 — Submission

1. Verify your OpenAI developer organization (individual or business verification; you need the Owner role)
2. Fully test in Developer Mode — stable, responsive, no crashes across scenarios
3. Confirm technical prerequisites: MCP server on a public production domain; CSP defined if there's a UI
4. Prepare submission metadata: app name, logo, description, company + privacy policy URLs, MCP/OAuth details, sample test prompts and responses, localization info, demo account credentials
5. Submit from the Plugin Submission Portal (scan tools → confirm compliance → submit for review) — you'll get a Case ID by email
6. Wait for review (timelines vary; rejections come with a rationale and you can usually fix and resubmit)
7. Publish yourself once approved — approval does not auto-list you
8. Handle updates carefully afterward: the published version runs on a frozen metadata snapshot, so tool/behavior changes require re-scanning and resubmitting a new version before they reflect in the directory

## Phase 6 — Post-Launch

- Monitor for the frozen-metadata gotcha whenever you ship changes
- Set up basic logging/alerting on your server (failed WP auths, API errors) — you won't get visibility from OpenAI's side
- Collect feedback from early Developer-Mode users before the directory listing goes live — cheaper to fix bugs pre-review than to get rejected

## Suggested First Step

Start with Phase 2 only, scoped to just yourself, no auth system yet: a minimal MCP server (Node + `mcp-handler`) with four tools, hardcoded to your own WP site. Get that working end-to-end before building out multi-tenancy.
