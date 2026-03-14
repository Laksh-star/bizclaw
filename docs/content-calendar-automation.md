# Content Calendar Automation — NanoClaw Skill Plan

A reusable pattern for automating a content-first social media brand using NanoClaw.
Covers weekly calendar generation, approval gate, content production, and optional scheduled publishing.

Adapt the brand-specific details (platforms, content type, APIs) to your use case.

---

## Use Case

A brand that publishes recurring themed content — quotes, tips, breakdowns, reviews — across
multiple social platforms plus a long-form article channel (blog, newsletter, etc.), where:

- Content is curated from an external data source (TMDB, a news API, a product DB, etc.)
- A weekly editorial calendar is reviewed and approved before anything is produced
- Publishing can be automatic (scheduled) or manual (on demand)

---

## Agent Architecture

Three independent agents, each a NanoClaw container run with a different prompt and scope:

```
┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐
│   CALENDAR AGENT     │───>│  PRODUCTION AGENT     │───>│  PUBLISHING AGENT    │
│                      │    │                       │    │  (optional)          │
│ • Data source lookup │    │ • Full copy per        │    │                      │
│ • Content advisory   │    │   platform             │    │ • Platform APIs      │
│ • 7-entry calendar   │    │ • Long-form article    │    │ • Auto OR manual     │
│ • Approval loop      │    │ • Branded image        │    │ • Confirms w/ links  │
│                      │    │ • Saves files, no      │    │                      │
│                      │    │   publish              │    │                      │
└──────────────────────┘    └──────────────────────┘    └──────────────────────┘
      Phase 1                      Phase 2                      Phase 3
```

Each agent reads/writes files in `/workspace/group/[brand]/`. State persists across runs via
the group workspace bind mount — no new DB tables needed.

---

## Phase 1 — Calendar Agent

### Triggers

| Trigger | Description |
|---------|-------------|
| Manual prompt | User sends theme or specific items to include |
| Weekly cron | Agent picks theme autonomously from `theme-history.json` |

### Data Source Advisory

The Calendar Agent uses an external data source to *recommend* content, not just look it up.
Examples:

- TMDB (movies/TV) — search by keyword, genre, trending, recommendations
- A news API — search by topic, recency, source
- A product catalogue — filter by category, season, inventory
- A quote/passage database — filter by theme or author

Flow:
1. Query data source → 10–12 candidates
2. `call_model` maps each candidate to the brand's content angle + drafts a preview
3. Agent selects best 7 (diversity of type, tone, era)
4. Sends formatted Telegram/WhatsApp summary for approval

### Approval State Machine

```
pending ──"approve"──────────────────> production_queued
pending ──"approve days 1-5"─────────> production_queued (partial)
pending ──"skip day N"───────────────> skipped
pending ──"swap day N: ..."──────────> editing ──[re-query + call_model]──> pending
pending ──"more options"─────────────> show unused candidates from shortlist
```

State stored in `current-calendar.json`. Handled in the existing group session — no new
infrastructure.

### Calendar Summary Message Format

```
[Brand] — Week of [Date] (Theme: [Theme])

[Data source] shortlisted 12 items. Best 7 below.

Day 1 — [Date]
Item: [Title / Name]
Angle: [Brand-specific content angle]
Preview: [First 1–2 lines of caption]
Article: [Proposed headline]

[Days 2–7...]

────
• "approve" → all 7 to production
• "approve days 1–5" → partial
• "skip day N" → remove
• "swap day N: [instruction]" → regenerate that entry
• "more options" → show 3 unused candidates
• "regenerate" → fresh calendar
```

---

## Phase 2 — Production Agent

### Trigger

Fires after approval — either automatically (if user replied "approve") or on explicit command.

### What It Produces per Entry

1. **Platform captions** (`call_model`, parallel):
   - Short-form platform (Twitter/X): 240 chars, punchy
   - Visual platform (Instagram): hook + hashtags
   - Professional platform (LinkedIn): longer, analytical tone
   - Shared post (Facebook): mirrors Instagram or a variant

2. **Long-form article** (`call_model`):
   - 800–1200 words
   - Structure: hook → context → core insight → applications → CTA

3. **Branded image** (Puppeteer):
   - Injects dynamic content into `quote-card.html` via CSS variables
   - `agent-browser screenshot` → PNG
   - 1080×1080 (works across all platforms)

4. **Saves production file** — no publishing yet:
   ```
   /workspace/group/[brand]/production/[date]-day[N].json
   ```

### After Production

Agent asks how to publish:
```
All 7 posts produced and ready.

• "auto-schedule" → queue each for its designated time
• "publish now" → publish all immediately
• "publish day N" → publish one on demand
• "hold" → save everything, publish later manually
```

---

## Phase 3 — Publishing Agent (Optional)

Publishing is a separate, optional step. Content sits in production files until triggered.

### Trigger Options

| Method | Description |
|--------|-------------|
| Auto-scheduled | Agent creates a `once` task per entry at designated time |
| "publish day N" | Immediate on-demand publish |
| "publish day N to [platform] only" | Platform-specific |
| Never | User downloads files and posts manually |

### Platform API Tools

Register as MCP tools in `container/agent-runner/src/[brand]-tools.ts`:

```typescript
export function registerBrandTools(server: McpServer) {
  server.tool('platform_a_publish', ...) // e.g. Instagram via Meta Graph API
  server.tool('platform_b_publish', ...) // e.g. Twitter via API v2
  server.tool('platform_c_publish', ...) // e.g. LinkedIn via API v2
  server.tool('blog_publish', ...)       // e.g. WordPress.com REST API
}
```

Each tool: takes `{ image_path, caption, article? }`, calls the platform API, returns the post URL.

---

## NanoClaw Implementation

### Files to Create (4 new files)

| File | Purpose |
|------|---------|
| `container/agent-runner/src/[brand]-tools.ts` | Publisher MCP tools + secrets helpers |
| `src/[brand]-config.ts` | `BRAND_SECRET_KEYS` constant |
| `groups/[brand]/CLAUDE.md` | All 3 agent workflows, brand voice, file paths |
| `groups/[brand]/templates/card.html` | Puppeteer image template |

### Files to Modify (3 lines total — BizClaw isolation pattern)

| File | Change |
|------|--------|
| `src/bizclaw-config.ts` | Add brand secret key names |
| `container/agent-runner/src/bizclaw-tools.ts` | 1 import + 1 `registerBrandTools(server)` call |
| `container/agent-runner/src/index.ts` | Add `mcp__[brand]__*` to `allowedTools` |

One new file per concern. One line added to each existing file. No structural changes to NanoClaw.

### Workspace File Layout

```
/workspace/group/[brand]/
  current-calendar.json       ← approval states + active calendar pointer
  theme-history.json          ← recent themes (for autonomous cron selection)
  calendars/
    YYYY-MM-DD.json           ← full 7-entry calendar
  production/
    YYYY-MM-DD-dayN.json      ← generated captions, article, image path
  images/
    YYYY-MM-DD-dayN.png       ← rendered image (1080×1080)
  templates/
    card.html                 ← Puppeteer HTML template
  logs/
    publish-YYYY-MM-DD-dayN.json  ← publish results + platform URLs
```

### Calendar Entry Schema

```json
{
  "day": 1,
  "post_date": "YYYY-MM-DD",
  "post_time": "10:00:00",
  "type": "movie | tv | article | product | ...",
  "title": "...",
  "source_id": "...",
  "content_angle": "...",
  "quote_or_hook": "...",
  "caption_preview": "...",
  "article_headline": "...",
  "approval_state": "pending | approved | skipped | editing | production_queued | produced | published",
  "production": null,
  "published": null
}
```

### Environment Variables Pattern

```bash
# Add to .env and data/env/env
BRAND_PLATFORM_A_TOKEN=
BRAND_PLATFORM_B_API_KEY=
BRAND_PLATFORM_B_API_SECRET=
BRAND_PLATFORM_B_ACCESS_TOKEN=
BRAND_PLATFORM_B_ACCESS_TOKEN_SECRET=
BRAND_PLATFORM_C_ACCESS_TOKEN=
BRAND_PLATFORM_C_REFRESH_TOKEN=
BRAND_BLOG_SITE_ID=
BRAND_BLOG_USERNAME=
BRAND_BLOG_APP_PASSWORD=
```

---

## Scheduling

One `schedule_type: 'once'` task per approved entry, created by the Production Agent via
`mcp__nanoclaw__schedule_task`. The existing task-scheduler polls for due tasks and fires them.
No custom cron-per-post infrastructure needed.

Weekly calendar cron: `schedule_type: 'cron'`, `schedule_value: '0 18 * * 0'` (adjust to preference).

---

## MVP → Full Progression

### MVP

- [ ] Manual calendar trigger
- [ ] Data source advisory at calendar stage
- [ ] Approve / skip / swap approval flow
- [ ] Production: captions + article + Puppeteer image
- [ ] Publishing: manual on-demand only
- [ ] 2 platforms first (simplest auth), then expand

### Full Version

- [ ] Weekly cron with autonomous theme selection
- [ ] "more options" from shortlist
- [ ] Auto-schedule option after production
- [ ] Multiple image templates by content type/mood
- [ ] Token auto-refresh with expiry reminders
- [ ] Theme history + post history to prevent repetition
- [ ] Platform-specific publish ("publish day N to LinkedIn only")

---

## Key Design Decisions

**Why 3 agents?**
Each can fail and be re-run independently. Regenerate calendar without re-producing.
Re-produce without regenerating calendar. Publish a single entry without triggering others.

**Why file-based state?**
Group workspace is bind-mounted — state persists across container restarts without new DB tables.
`current-calendar.json` is the single source of truth; platform-specific files hold full content.

**Why Puppeteer for images?**
Chromium is already in the container. Zero cost, full CSS control, runs offline.
No Canva/Bannerbear dependency.

**Why is publishing optional?**
Decoupling production from publishing gives a manual escape hatch without changing any code.
The Publishing Agent is triggered by a conversation reply or a scheduled task — same agent, different prompt.
