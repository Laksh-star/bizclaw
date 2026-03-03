# BizClaw Development Log

Track of features, skills, and architectural decisions specific to BizClaw (fork of NanoClaw MIT).

---

## v0.6 — Mar 3, 2026

### Telegram Native Streaming (sendMessageDraft)

- **`sendMessageDraft` integration** — Andy now streams responses to Telegram DMs using the Bot API 9.5 native streaming method (released Mar 1, 2026, 2 days ago). Users see the response being typed in real-time rather than receiving it all at once.
- **Turn-level streaming** — The Claude Agent SDK emits complete assistant turns (not token deltas). Each turn's text is forwarded as a draft update; the final `sendMessage` commits the response and the draft preview dismisses.
- **`draft_id` stability** — A unique non-zero `draftId` is generated per response session (`Date.now() % 2_000_000_000 + 1`). Repeated calls with the same `draft_id` update the same draft with animation.
- **DM-only** — `sendMessageDraft` only works in private chats (positive chat IDs). Groups fall back to the existing `sendMessage` behavior.
- **`<internal>` stripping applied** — Partial text has internal reasoning blocks stripped before being sent as a draft, same as final results.

### Files Changed
- `container/agent-runner/src/index.ts` — Emit `PARTIAL` markers from `assistant` SDK messages
- `src/container-runner.ts` — Parse `PARTIAL` markers in-order with `OUTPUT` markers; `ContainerOutput.partial?: string`
- `src/types.ts` — `Channel.streamPartial?(jid, draftId, text)` optional method
- `src/channels/telegram.ts` — `streamPartial()` implementation via `bot.api.sendMessageDraft()`
- `src/index.ts` — Generate `draftId` per response, call `streamPartial` on partials

---

## v0.5 — Feb 28, 2026

### Skills Added
- **`/agent-design`** — Design framework for new BizClaw capabilities. Run before building any tool, skill, or agent behavior. Encodes principles from Anthropic's "Lessons from Building Claude Code: Seeing like an Agent". Walks through: Tool vs Instruction, Knowledge vs Action, cognitive load check, Skill vs Core change, evolution check. Outputs a principled design doc. Includes a BizClaw design decisions log.

### Design Decisions (from /agent-design framework)
- **`/andy-guide` (progressive disclosure)** — Deferred. CLAUDE.md not at painful scale yet. Revisit at first client deployment or when 10+ skills exist.
- **`TELEGRAM_ONLY=true`** — WhatsApp disabled. Andy is Telegram-only. Re-enable: set `TELEGRAM_ONLY=false` in `.env`, sync to `data/env/env`, restart service.

### Collections Report Fixes
- **HTML email formatting** — Updated task prompt to use `mimeType: multipart/alternative` + `htmlBody`. Report now renders as styled HTML in email clients (no more raw `**`, `##` tags).
- **Verified working** — Test run confirmed: task fires correctly at 8 PM IST, email delivered, HTML formatted. Root cause of Feb 26 failure was WhatsApp reconnect event putting the main group queue in a bad state (not a timezone issue as originally diagnosed).

---

## v0.4 — Feb 26, 2026 (afternoon)

### Maintenance
- **Disk cleanup**: Freed ~9GB — removed `nanoclaw-agent:latest` (pre-rename stale image, 5GB) + buildkit container snapshots
- **Deregistered inactive groups**: Removed `bhakthi-tv-test-ai`, `lns-test`, `my-ai-helper`, `ngmf-salesm-test` from DB + session/group folders. Active groups: `main`, `telegram`, `ngmf-salesm-tg`
- **`scripts/cleanup.sh`**: New script — removes buildkit, stopped containers, old images. Run any time after a container build.


### Skills Added
- **`/credentials`** — Browser session and cookie management. Saves `state save/load` sessions per site. Supports JSON key-value object and Cookie-Editor array formats for cookie injection via `eval`.

### Bug Fixes
- **`list_tasks` showed empty to non-main groups**: Two bugs:
  1. `writeTasksSnapshot` filtered tasks per-group → fixed to write all tasks to every group's snapshot
  2. Agent-runner source only copied on first spawn → fixed to always sync, so code changes to `ipc-mcp-stdio.ts` propagate immediately
- **Container image rename breaks service**: After multi-tenant config renamed image to `bizclaw-agent:latest`, service failed (Apple Container tried to pull from Docker Hub). Fix: always rebuild after image name change.

### Known Limitations Documented
- **GoDaddy + Akamai**: Playwright blocked by bot detection on both godaddy.com and SSO login page. Cookie injection also blocked. Alternative: use GoDaddy REST API (`developer.godaddy.com`). See `groups/telegram/credentials/` for test artifacts.
- **Scheduled tasks survive container rebuilds**: Tasks are in SQLite — container image changes don't affect them.
- **Pino logger can freeze** after WhatsApp reconnect events. Symptom: service running, log file not updating. Fix: `launchctl kickstart -k gui/$(id -u)/com.nanoclaw`.

### Core Fixes (agent-runner propagation)
- **`src/container-runner.ts`**: Agent-runner source now synced on EVERY container spawn (was: only on first spawn). Critical — any change to `ipc-mcp-stdio.ts` now takes effect immediately without manual intervention.
- **`src/container-runner.ts`**: `writeTasksSnapshot` now writes all tasks to every group (was: filtered per-group). All Andys can see the full task list.
- **`container/agent-runner/src/ipc-mcp-stdio.ts`**: `list_tasks` removed group filter — returns all tasks.

### Groups
- **`groups/telegram/CLAUDE.md`** created — documents task visibility, active recurring tasks, credentials folder. Now tracked in git.
- **`groups/global/CLAUDE.md`** — added Scheduled Tasks section explaining `list_tasks` usage.

### GoDaddy API (TODO)
- Domain search, purchase, DNS management via REST API
- No browser/session needed — API key based
- Revisit: create `/add-godaddy` skill using `developer.godaddy.com` keys

---

## v0.3 — Feb 26, 2026

### Multi-Tenant Config
- `INSTANCE_NAME` exported from `src/config.ts` (default: `bizclaw`)
- `MOUNT_ALLOWLIST_PATH` scoped to `~/.config/bizclaw/{INSTANCE_NAME}/`
- `CONTAINER_IMAGE` = `{INSTANCE_NAME}-agent:latest`
- `container/build.sh` reads `INSTANCE_NAME` from `.env`

### Skills Added
- **`/setup-sales-crm`** — Conversational CRM in any group. Tracks leads/deals/pipeline via JSON files. Weekly pipeline email. Natural language interface via CLAUDE.md injection.

---

## v0.2 — Feb 25–26, 2026 (Productization Sprint)

### Rebrand
- Renamed from `Laksh-star/nanoclaw` → `Laksh-star/bizclaw`
- `package.json` name: `bizclaw`
- PR #345 on qwibitai/nanoclaw closed

### Config
- `.env.example` fully documented — all vars with comments, grouped by category
- `groups/global/CLAUDE.md` — removed hardcoded Gmail
- `groups/global/config.md` (gitignored) — per-instance Gmail + owner config
- `groups/global/config.md` format:
  ```
  # BizClaw Instance Configuration
  ## Gmail
  Account: <email>
  ## Owner
  Name: <name>
  ```

### Skills Added / Updated
- **`/setup-collections-report`** — Guided setup for daily collections email reports
- **`/setup`** — Added Step 12: BizClaw Extras (assistant name, OpenRouter, Tavily, Gmail, Telegram, collections report)

### README
- Full rewrite as BizClaw product page
- Feature table vs NanoClaw, Apple Container section, client deployment FAQ

---

## v0.1 — Feb 25, 2026 (Feature Sprint)

### New Features (built on NanoClaw)
- **Multi-model orchestration** via OpenRouter (`call_model` MCP tool in agent-runner)
  - `OPENROUTER_API_KEY` + `OPENROUTER_DEFAULT_MODEL` in secrets pipeline
  - Falls back to default model when none specified
- **Tavily MCP search** — structured web search with source citations
  - `tavily-mcp` npm package added to container Dockerfile
  - `TAVILY_API_KEY` in secrets pipeline
- **Telegram voice transcription** — Whisper transcription for Telegram voice notes
  - Reuses `transcribeAudioBuffer()` from `src/transcription.ts`
- **NGMFSalesTG daily collections report** — Scheduled cron task (8 PM IST)
  - Analyzes Telegram group messages with Kimi K2.5
  - Emails to 3 recipients via Gmail MCP

### Bug Fixes
- **Scheduler duplicate runs** — `runningTaskIds: Set<string>` prevents re-enqueueing in-flight tasks
- **Scheduled task idle timeout** — 60s for scheduled tasks vs 30min for interactive
- **IPC cross-group auth** — tasks targeting non-local groups must come from `data/ipc/main/tasks/`

### Upstream Sync
- Rebased on qwibitai/nanoclaw (50 upstream commits)
- Resolved conflicts: package-lock.json, src/db.ts, whatsapp.ts, whatsapp-auth.ts, task-scheduler.ts
- Kept remote's `fetchLatestWaWebVersion` with catch fallback
- Added `import os from 'os'` to container-runner.ts (homeDir fix post-rebase)
- Added `Context` import from grammy (type annotation fix for grammY callbacks)

---

## Upstream Diff Summary (What BizClaw Adds vs NanoClaw)

| Category | Files | Notes |
|----------|-------|-------|
| Multi-model | `container/agent-runner/src/ipc-mcp-stdio.ts` | `call_model` tool |
| Multi-model | `container/agent-runner/src/index.ts` | Tavily MCP, OpenRouter envs |
| Multi-model | `container/Dockerfile` | `tavily-mcp` global install |
| Multi-model | `src/container-runner.ts` | OPENROUTER_*, TAVILY_API_KEY secrets |
| Telegram | `src/channels/telegram.ts` | Voice transcription, `sendMessageDraft` streaming |
| Scheduler | `src/task-scheduler.ts` | `runningTaskIds`, 60s idle timeout |
| Config | `src/config.ts` | INSTANCE_NAME, scoped paths |
| Build | `container/build.sh` | INSTANCE_NAME-based image name |
| Skills | `.claude/skills/setup-collections-report/` | Daily collections report |
| Skills | `.claude/skills/setup-sales-crm/` | Conversational CRM |
| Skills | `.claude/skills/setup/SKILL.md` | Step 12 BizClaw Extras |
| Docs | `README.md` | Full BizClaw product README |
| Config | `.env.example` | Documented all vars |
| Memory | `groups/global/CLAUDE.md` | Removed hardcoded Gmail |

---

## Pending

- [ ] Create `bizclaw` GitHub org (manual at github.com/organizations/new), transfer repo
- [ ] Run `/setup-sales-crm` end-to-end on test group to validate skill
- [ ] Client onboarding checklist / deployment guide skill
- [ ] Investigate: WhatsApp confirmation messages routing to WA instead of Telegram (known limitation — scheduled tasks run under WA main context)
