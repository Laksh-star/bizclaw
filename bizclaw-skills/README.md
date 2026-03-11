# BizClaw Skills

NanoClaw-compatible skills for adding BizClaw capabilities to any NanoClaw installation.

## Installation

Copy any skill folder into your NanoClaw `.claude/skills/` directory and run `/skill-name` in Claude Code.

```bash
cp -r bizclaw-skills/add-openrouter /path/to/your/nanoclaw/.claude/skills/
# then in Claude Code:
# /add-openrouter
```

## Skills

| Skill | Description |
|-------|-------------|
| [add-openrouter](add-openrouter/SKILL.md) | Multi-model AI via OpenRouter — route subtasks to Kimi, Gemini, DeepSeek, GPT while Claude orchestrates |
| [add-tavily-search](add-tavily-search/SKILL.md) | Structured web search with citations via Tavily — replaces basic WebSearch/WebFetch |
| [add-telegram-streaming](add-telegram-streaming/SKILL.md) | Real-time response streaming in Telegram DMs via Bot API 9.5 sendMessageDraft |
| [add-lm-studio](add-lm-studio/SKILL.md) | Local LLM inference via LM Studio — zero API cost, fully private |

## Compatibility

These skills target NanoClaw's current `main` branch file structure:
- `src/container-runner.ts` — secrets pipeline
- `container/agent-runner/src/ipc-mcp-stdio.ts` — MCP tool registration
- `container/agent-runner/src/index.ts` — MCP server config
- `src/channels/telegram.ts` — Telegram channel
- `src/types.ts` — Channel interface

## About BizClaw

BizClaw is a customized NanoClaw installation with production-grade additions:
multi-model AI routing, structured search, local model inference, Telegram streaming,
scheduled reports, and more. These skills package those additions for upstream NanoClaw users.
