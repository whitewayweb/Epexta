# WP ChatGPT Publisher

An MCP server (deployed on Vercel) that lets ChatGPT write, categorize, tag, illustrate, and publish blog posts directly to a WordPress site via the WP REST API.

## Tools exposed

- `list_posts` — read existing posts
- `list_categories` / `list_tags` — read existing terms
- `create_post` — create a post (draft by default), with categories/tags resolved or created by name, plus optional SEO title/description
- `update_post` — edit an existing post's content, terms, SEO meta, slug, or status
- `publish_post` — flip a post to published
- `set_featured_image` — upload an image (by URL or base64) and set it as a post's featured image

No delete capability is exposed (for posts, media, categories, or tags) — intentionally, to keep the plugin's blast radius limited to creating and editing content.

## Setup

1. Copy `.env.local.example` to `.env.local` and fill in `DATABASE_URL`, `PAYLOAD_SECRET`, `ENCRYPTION_KEY`.
2. `npm install`
3. `npm run dev`
4. Sign up at `http://localhost:3000/wordpress/connect`. On your WordPress site: **Users → Profile → Application Passwords**, generate one for a user with publishing permissions, then paste the site URL, username, and Application Password into the connection form.
5. Generate an API key from the same page.

## Deploying

```bash
vercel env add DATABASE_URL
vercel env add PAYLOAD_SECRET
vercel env add ENCRYPTION_KEY
vercel --prod
```

Register the resulting `https://<your-project>.vercel.app/api/wordpress/mcp` URL as an MCP connector in ChatGPT's Developer Mode, using the API key from `/wordpress/connect` as the bearer token. Each organisation's API key only ever reaches that organisation's own connected WordPress site.

## Notes

- SEO fields are written as Yoast-compatible meta keys (`_yoast_wpseo_title`, `_yoast_wpseo_metadesc`). This only takes effect if the target site has Yoast SEO active and those keys registered for REST access — otherwise WordPress silently ignores unknown meta keys. RankMath support is not yet implemented.
- All posts default to `draft` status — nothing goes live without an explicit publish.
- No delete capability is exposed for any resource type — this plugin can only create, read, and update.
- Multi-tenant: each organisation connects its own WordPress site and generates its own API key at `/wordpress/connect` — one API key never reaches another organisation's site.

## Troubleshooting

If tool calls fail with a WordPress `rest_not_logged_in` or `rest_cannot_create` error even though your Application Password looks correct, check for:

- **A REST API auth plugin overriding core auth** — plugins like miniOrange's "WP REST API Authentication" intercept all REST requests and reject anything that isn't authenticated through their own configured method, silently ignoring valid core Application Passwords. Either deactivate the plugin or enable Basic Auth for your user in its settings.
- **A mixed-up `.env.local` value** — a real WordPress Application Password is always 24 lowercase letters/digits shown as 6 groups of 4 (e.g. `abcd efgh ijkl mnop qrst uvwx`). If the value contains symbols or looks like a normal login password, it was pasted wrong — regenerate one from **Users → Profile → Application Passwords** and replace the value with no surrounding quotes and no trailing comments on the same line.
- **The Authorization header not reaching PHP** — common on LiteSpeed/cPanel/shared hosting. WordPress usually auto-adds a fix to the auto-generated block in `.htaccess` (`RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]`); if it's missing, add it manually above `# BEGIN WordPress`.

To check what WordPress thinks is authenticating a request, hit `GET /wp-json/wp/v2/users/me` with the same Basic Auth header the plugin uses — a 200 with your user's data confirms the credentials are valid before debugging further up the stack.

## Dev checks

```bash
npm run typecheck
npm run lint
npm run knip
```
