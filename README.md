<p align="center">
  <strong>BizClaw</strong>
</p>

<p align="center">
  Business AI assistant for WhatsApp and Telegram. Multi-model orchestration, scheduled reports, sales pipeline automation — running natively on Apple Container.
</p>

> Built on [NanoClaw](https://github.com/qwibitai/nanoclaw) (MIT). BizClaw extends NanoClaw with business-focused capabilities out of the box.

## What BizClaw Adds

| Feature | NanoClaw | BizClaw |
|---------|----------|---------|
| WhatsApp | ✅ | ✅ |
| Telegram | Via skill | ✅ Built-in |
| Voice transcription (Whisper) | Via skill | ✅ Built-in |
| Web search | Basic | ✅ Tavily MCP (structured, cited) |
| Multi-model AI | Claude only | ✅ OpenRouter (Kimi, Gemini, any model) |
| Daily collections report | ❌ | ✅ `/setup-collections-report` skill |
| Sales CRM | ❌ | ✅ `/setup-sales-crm` skill |
| Apple Container | Via skill | ✅ Default runtime |
| Gmail | Via skill | ✅ Built-in |

## Why Apple Container

BizClaw runs on [Apple Container](https://github.com/apple/container) — Apple's native macOS container runtime — instead of Docker. Each Claude agent runs in a lightweight Linux VM with hardware-enforced isolation, no Docker daemon required.

- **Faster startup** — VMs boot in ~1 second, no Docker Desktop overhead
- **Native macOS** — uses Apple's Virtualization framework directly
- **Smaller footprint** — no background daemon consuming resources
- **Same security model** — full filesystem isolation, only mounted directories accessible

If you're on Linux, Docker still works via `/convert-to-docker`.

## Why BizClaw

NanoClaw is a great foundation — secure container isolation, small codebase, Claude Agent SDK native. BizClaw adds what businesses actually need:

- **Telegram + WhatsApp** — your team is probably on both
- **Multi-model via OpenRouter** — use Kimi K2.5 for analysis, Gemini for summarization, Claude for orchestration. Optimize cost per task.
- **Tavily search** — structured web research with source citations, better than raw web search
- **Automated reporting** — daily collections reports, pipeline summaries, any recurring data → email workflow
- **Voice in Telegram** — send a voice note, Andy transcribes and acts on it

If you're running a business team on WhatsApp or Telegram and want an AI assistant that automates reports, understands your context, and can be deployed for clients — BizClaw is the starting point.

## Quick Start

```bash
git clone https://github.com/Laksh-star/bizclaw.git
cd bizclaw
claude
```

Then run `/setup`. Claude Code handles everything: dependencies, authentication, Apple Container setup and service configuration.

## Skills

| Skill | What it does |
|-------|-------------|
| `/setup` | First-time installation and authentication |
| `/setup-sales-crm` | Lightweight sales CRM in any group — track leads, pipeline, deals; weekly report by email |
| `/setup-collections-report` | Daily AI-analyzed payment/collections report from any group chat, emailed to stakeholders |
| `/add-gmail` | Add Gmail send/receive integration |
| `/add-telegram` | Add Telegram channel |
| `/add-voice-transcription` | Add WhatsApp voice transcription |
| `/convert-to-apple-container` | Switch from Docker to Apple Container |
| `/customize` | Add channels, integrations, change behavior |
| `/debug` | Troubleshoot container and service issues |

## Usage

Talk to your assistant with the trigger word (default: `@Andy`):

```
@Andy send an overview of the sales pipeline every weekday morning at 9am
@Andy summarize the last 24 hours of messages in the sales group and email it to the team
@Andy search for the latest news on [topic] and send me a briefing
@Andy transcribe this voice note and add it to my notes
```

From your main channel (self-chat), manage everything:
```
@Andy list all scheduled tasks
@Andy pause the Monday briefing task
@Andy set up a daily collections report for the NGMFSales group
```

## Requirements

- macOS (Apple Container) or Linux (Docker)
- Node.js 20+
- [Claude Code](https://claude.ai/download)
- [Apple Container](https://github.com/apple/container) (macOS, recommended) or [Docker](https://docker.com/products/docker-desktop)
- OpenRouter API key (for multi-model — optional, falls back to Claude)
- Tavily API key (for web search — optional)

## Architecture

```
WhatsApp/Telegram → SQLite → Polling loop → Apple Container (Claude Agent SDK) → Response
```

Single Node.js process. Agents execute in isolated Linux VMs (Apple Container) with filesystem isolation. Only mounted directories are accessible. Per-group message queue with concurrency control. IPC via filesystem.

Key files:
- `src/index.ts` — Orchestrator: state, message loop, agent invocation
- `src/channels/whatsapp.ts` — WhatsApp connection (Baileys)
- `src/channels/telegram.ts` — Telegram connection (grammY)
- `src/container-runner.ts` — Spawns streaming agent containers
- `src/task-scheduler.ts` — Runs scheduled tasks
- `src/transcription.ts` — Voice transcription via OpenAI Whisper
- `src/db.ts` — SQLite operations
- `groups/*/CLAUDE.md` — Per-group memory and instructions

## FAQ

**Apple Container vs Docker?**

Apple Container is the default on macOS — lighter, faster, no daemon. Docker works too and is the default on Linux. Switch anytime via `/convert-to-apple-container` or `/convert-to-docker`.

**Can I use any AI model?**

Claude is the orchestrator (runs via Claude Agent SDK). For subtasks — summarization, analysis, writing — you can use any model available on OpenRouter by calling `call_model` in your prompts. Set `OPENROUTER_API_KEY` and `OPENROUTER_DEFAULT_MODEL` in `.env`.

**Is this secure?**

Agents run in Apple Container VMs or Docker containers — hardware-enforced isolation, not application-level permission checks. They can only access explicitly mounted directories. The codebase is small enough to read and audit yourself. See [docs/SECURITY.md](docs/SECURITY.md).

**Can I deploy this for clients?**

Yes. Each group has isolated filesystem and memory. Set up a separate group per client, configure their CLAUDE.md, and deploy. The `/setup-collections-report` skill is designed to be client-ready out of the box.

**How do I debug issues?**

Ask Claude Code directly: "Why isn't the scheduler running?" "What's in the recent logs?" "Why did this message not get a response?"

## Contributing

BizClaw follows NanoClaw's **Skills over Features** philosophy. Don't add features to the core — contribute skills.

All skills live in [`.claude/skills/`](.claude/skills/). Each skill is a folder with a `SKILL.md` file — plain instructions that Claude Code follows when you run `/skill-name`. To add a new capability, create `.claude/skills/your-skill/SKILL.md`. See existing skills for examples.

## License

MIT — built on [NanoClaw](https://github.com/qwibitai/nanoclaw) (MIT). Original copyright retained.
