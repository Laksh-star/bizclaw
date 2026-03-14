---
name: add-content-calendar
description: Set up a weekly content calendar automation for a social media brand. Covers TMDB/external data advisory, 3-agent pipeline (Calendar → Production → Publishing), approval gate, branded image generation via Puppeteer, and scheduled publishing to Instagram, Facebook, Twitter/X, LinkedIn, and WordPress.com. Use when asked to automate social media posting, set up a content calendar, or build a brand publishing workflow.
---

# Add Content Calendar Automation

Sets up a 3-agent content calendar pipeline for a social media brand:
- **Calendar Agent**: queries a data source (TMDB, news API, etc.) to recommend content, generates a weekly 7-post calendar, handles approval conversation
- **Production Agent**: generates platform captions, long-form article, renders branded image via Puppeteer — saves to files, no publishing yet
- **Publishing Agent** (optional): publishes to all platforms on demand or on schedule

Follows the BizClaw isolation pattern: one new file per concern, one import line in each existing file.

---

## Phase 1: Gather Requirements

Ask the user:

1. **Brand name and handle** — e.g. "movisvami / @movisvami"
2. **Content type** — what kind of content? (movie/TV quotes, industry tips, product showcases, news commentary, etc.)
3. **Data source** — what API or source drives content recommendations? (TMDB for movies/TV, a news API, a product DB, manual input only)
4. **Platforms** — which of these: Instagram, Facebook, Twitter/X, LinkedIn, WordPress/blog?
5. **Posting frequency** — daily? 3x week? Manual only?
6. **Brand voice** — 2–3 sentences describing tone (e.g. "professional and cinematic, not motivational-poster")
7. **Image dimensions** — 1080×1080 square (default) or 1080×1350 portrait?

Then confirm: "Here's what I'll build: [summary]. Ready to proceed?"

---

## Phase 2: Create Brand Source Files

### 2a. Brand config (`src/[brand]-config.ts`)

Create `src/[brand]-config.ts`:

```typescript
/**
 * [Brand] secret keys for the host process.
 * Add to BIZCLAW_SECRET_KEYS in bizclaw-config.ts to activate forwarding.
 */
export const [BRAND]_SECRET_KEYS = [
  // Add platform credential key names based on selected platforms:
  // Instagram + Facebook (Meta):
  '[BRAND]_META_PAGE_ACCESS_TOKEN',
  '[BRAND]_INSTAGRAM_BUSINESS_ACCOUNT_ID',
  '[BRAND]_FACEBOOK_PAGE_ID',
  // Twitter/X:
  '[BRAND]_TWITTER_API_KEY',
  '[BRAND]_TWITTER_API_SECRET',
  '[BRAND]_TWITTER_ACCESS_TOKEN',
  '[BRAND]_TWITTER_ACCESS_TOKEN_SECRET',
  // LinkedIn:
  '[BRAND]_LINKEDIN_ACCESS_TOKEN',
  '[BRAND]_LINKEDIN_PERSON_URN',
  // WordPress.com:
  '[BRAND]_WORDPRESS_SITE_ID',
  '[BRAND]_WORDPRESS_USERNAME',
  '[BRAND]_WORDPRESS_APP_PASSWORD',
] as const;
```

### 2b. Publishing tools (`container/agent-runner/src/[brand]-tools.ts`)

Create `container/agent-runner/src/[brand]-tools.ts` with:

- `export function register[Brand]Tools(server: McpServer): void` — registers MCP tools for each selected platform
- `export function get[Brand]NanoclawMcpEnv(sdkEnv)` — returns brand credential env vars to forward to nanoclaw MCP server

**Tools to implement** (only for selected platforms):

**Image upload** (needed for Instagram/Facebook which require public URL):
- `[brand]_upload_image({ image_path })` → uploads to WordPress.com media, returns `{ media_url, media_id }`

**Platform publishers** (each takes `image_url` or `image_path`):
- `[brand]_publish_wordpress({ title, content, tags?, featured_image_url?, status })` → Basic auth, WordPress.com REST API
- `[brand]_publish_instagram({ image_url, caption })` → Meta Graph API, 2-step: create container → publish
- `[brand]_publish_facebook({ image_url, caption })` → Meta Graph API, `POST /{page-id}/photos`
- `[brand]_publish_twitter({ image_path, text })` → OAuth 1.0a, media upload + tweet
- `[brand]_publish_linkedin({ image_path, text })` → Bearer token, register upload → binary PUT → ugcPost

**OAuth 1.0a helper for Twitter** (include in the tools file):
```typescript
function buildOAuth1Header(method, url, requestParams, consumerKey, consumerSecret, tokenKey, tokenSecret): string
// Uses crypto.createHmac('sha1', signingKey).digest('base64')
// Returns 'OAuth oauth_consumer_key="...", oauth_signature="...", ...'
```

**Error handling pattern**: each tool checks for missing credentials with a helper, returns `{ content: [{ type: 'text', text: '...' }], isError: true }` on failure.

### 2c. Wire into existing files (3 lines total)

**`src/bizclaw-config.ts`** — add brand keys to `BIZCLAW_SECRET_KEYS`:
```typescript
// [Brand] credentials
'[BRAND]_META_PAGE_ACCESS_TOKEN',
// ... rest of keys
```

**`container/agent-runner/src/ipc-mcp-stdio.ts`** — add after `registerBizclawTools(server)`:
```typescript
import { register[Brand]Tools } from './[brand]-tools.js';
// ... (at bottom, after registerBizclawTools call)
register[Brand]Tools(server);
```

**`container/agent-runner/src/index.ts`** — add to nanoclaw MCP server env:
```typescript
import { get[Brand]NanoclawMcpEnv } from './[brand]-tools.js';
// ... (inside mcpServers.nanoclaw.env spread)
...get[Brand]NanoclawMcpEnv(sdkEnv),
```

### 2d. Puppeteer image template (`groups/[brand]/templates/quote-card.html`)

Create a 1080×1080 (or 1080×1350) branded HTML file. Key elements:
- Dark background with brand accent color
- Large quote text with auto-scaling based on length (use JS to adjust font-size)
- Character/source attribution line
- Brand name and handle in corner
- Content injected via `document.getElementById(...).textContent = '...'` from agent-browser eval

### 2e. Group CLAUDE.md (`groups/[brand]/CLAUDE.md`)

Document all 3 agents for Andy:

**Calendar Agent section**:
- How to query the data source (TMDB tools, news API, etc.)
- How to map results to the brand's content angle via `call_model`
- Calendar JSON schema (with `approval_state` field)
- How to format and send the Telegram approval summary
- How to handle each approval reply type ("approve", "skip day N", "swap day N: ...", "more options")

**Production Agent section**:
- `call_model` prompt templates for platform captions (one call per entry, JSON output)
- `call_model` prompt for long-form article (structure: hook → context → principle → 3 applications → CTA)
- Puppeteer steps: copy template, open, inject values via eval, screenshot, close
- Production file schema
- Post-production publishing options message

**Publishing Agent section**:
- Order: upload image first → WordPress → Instagram/Facebook (use hosted URL) → Twitter/LinkedIn (binary)
- Publish log schema
- Auto-schedule flow: `mcp__nanoclaw__schedule_task` with isolated context, full prompt

**File paths reference** table.

---

## Phase 3: Gitignore Brand Files

Add to `.gitignore` (brand files are local, only generic patterns go to repo):

```gitignore
# [Brand] brand-specific source files (local only)
src/[brand]-config.ts
container/agent-runner/src/[brand]-tools.ts
docs/[brand]-*.md
```

Note: `groups/[brand]/` is already gitignored by the existing `groups/*` rule.

---

## Phase 4: Add Credentials

Tell the user which credentials are needed based on selected platforms:

**Meta (Instagram + Facebook)**
- Create an App at developers.facebook.com
- Add Instagram Graph API + Pages API products
- Use Graph API Explorer to generate a **long-lived Page Access Token** (60-day)
- Get Instagram Business Account ID: `GET /me/accounts` → find page → `GET /{page-id}?fields=instagram_business_account`
- Store: `[BRAND]_META_PAGE_ACCESS_TOKEN`, `[BRAND]_INSTAGRAM_BUSINESS_ACCOUNT_ID`, `[BRAND]_FACEBOOK_PAGE_ID`
- Note: Instagram account must be Business or Creator, connected to a Facebook Page

**Twitter/X**
- developer.twitter.com → create Project + App → "Keys and Tokens"
- Generate Access Token + Secret for the posting account (OAuth 1.0a)
- Store: 4 keys (API Key, API Secret, Access Token, Access Token Secret)

**LinkedIn**
- developers.linkedin.com → create App → add "Share on LinkedIn" + "OpenID Connect" products
- OAuth 2.0 flow: `https://www.linkedin.com/oauth/v2/authorization` → get code → exchange for tokens
- Store: `[BRAND]_LINKEDIN_ACCESS_TOKEN`, `[BRAND]_LINKEDIN_PERSON_URN` (format: `urn:li:person:XXXXXXX`)
- Refresh token expires in 1 year; access token in 60 days

**WordPress.com**
- WordPress Admin → Users → [username] → Application Passwords → Add New
- Store: `[BRAND]_WORDPRESS_SITE_ID` (numeric ID or domain), `[BRAND]_WORDPRESS_USERNAME`, `[BRAND]_WORDPRESS_APP_PASSWORD`
- Note: WordPress.com Free plan may limit media uploads — Business plan recommended

Add all credentials to `.env` and `data/env/env`.

---

## Phase 5: Build and Register Group

```bash
npm run build
./container/build.sh
```

Both must succeed. Then register the brand group so Andy gets a workspace:

Drop an IPC task (or tell the user to ask Andy):
```
"register a new group called [brand] with folder [brand] and trigger @[brand]"
```

This creates `data/sessions/[brand]/` and makes `/workspace/group/` available to the agent.

---

## Phase 6: Restart and Verify

```bash
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # macOS
# Linux: systemctl --user restart nanoclaw
```

Tell the user to test:
1. Send: "[brand] calendar: [theme]" — should trigger Calendar Agent, get TMDB results, send approval summary
2. Reply: "approve" — should trigger Production Agent, render image, send publishing options
3. Reply: "publish day 1" — should publish to first selected platform, confirm with link/ID

---

## Troubleshooting

**"Missing credentials" error from a tool**
→ Credential not reaching the nanoclaw MCP server process. Check:
1. It's in `.env` and `data/env/env`
2. It's in `BIZCLAW_SECRET_KEYS` in `bizclaw-config.ts`
3. It's in `get[Brand]NanoclawMcpEnv()` in the tools file
4. Service was restarted after adding — container must be freshly spawned

**Instagram "requires public image URL"**
→ Call `[brand]_upload_image` first before `[brand]_publish_instagram`. The tool returns `media_url`.

**Twitter OAuth errors**
→ Check token has Write permission (not just Read). In Twitter Developer Portal → App → User authentication settings → App permissions must be "Read and Write".

**LinkedIn 403 on ugcPosts**
→ App needs "Share on LinkedIn" product approved. Go to app page → Products → request access.

**WordPress "Forbidden" on media upload**
→ Application Password may not have media permissions. Try re-generating it. On WordPress.com, Business plan is required for unrestricted API access.

**Puppeteer image is blank/wrong**
→ Check that `agent-browser eval` quotes are escaped correctly. Single quotes inside `eval "..."` break the shell command. Use `agent-browser eval 'document.getElementById("quote-text").textContent = "..."'` if quote text contains single quotes.
