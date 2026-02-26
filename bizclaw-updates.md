# BizClaw Development Log

Track of features, skills, and architectural decisions specific to BizClaw (fork of NanoClaw MIT).

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
| Telegram | `src/channels/telegram.ts` | Voice transcription |
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
