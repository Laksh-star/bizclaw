---
name: add-openrouter
description: Add multi-model AI support to NanoClaw via OpenRouter. Route subtasks to any model (Gemini, Kimi, DeepSeek, GPT) while Claude remains the orchestrator. Use when asked to add OpenRouter, multi-model, or alternative AI model support.
---

# Add OpenRouter Integration

Adds a `call_model` MCP tool to the NanoClaw container agent. Claude stays as the orchestrator but can delegate subtasks to cheaper/specialized models via OpenRouter's unified API.

Tool added: `call_model` — accepts `model` (optional), `prompt`, `system` (optional), `max_tokens` (optional). Calls OpenRouter `/chat/completions`. Returns the response text.

## Phase 1: Pre-flight

### Check if already applied

Check if `call_model` is already registered. Search `container/agent-runner/src/ipc-mcp-stdio.ts`:

```bash
grep -n "call_model" container/agent-runner/src/ipc-mcp-stdio.ts
```

If found, skip to Phase 3.

### Get an OpenRouter API key

If the user doesn't have one: https://openrouter.ai/keys

Popular models and their IDs:
- `moonshotai/kimi-k2.5` — long-context editing and writing
- `google/gemini-2.5-flash` — fast analysis
- `perplexity/sonar-pro` — web-grounded research
- `openai/gpt-4o` — general purpose

## Phase 2: Apply Code Changes

### Add API keys to .env

Append to `.env`:

```bash
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_DEFAULT_MODEL=moonshotai/kimi-k2.5
```

Also add to `data/env/env` if it exists (container environment mirror):

```bash
cat .env | grep -E "OPENROUTER" >> data/env/env
```

### Pass secrets to container

Read the file `src/container-runner.ts`. Find the `buildContainerArgs` function. Locate where env vars are pushed with `args.push('-e', ...)`.

Add after the existing env var pushes (before the `args.push(CONTAINER_IMAGE)` line):

```typescript
// OpenRouter secrets
const openrouterSecrets = readEnvFile(['OPENROUTER_API_KEY', 'OPENROUTER_DEFAULT_MODEL']);
for (const [key, value] of Object.entries(openrouterSecrets)) {
  if (value) args.push('-e', `${key}=${value}`);
}
```

Note: `readEnvFile` is already imported from `./env.js` in `container-runner.ts`.

### Register the call_model tool

Read `container/agent-runner/src/ipc-mcp-stdio.ts`. Add the `call_model` tool before the final `// Start the stdio transport` comment:

```typescript
server.tool(
  'call_model',
  `Call a non-Claude AI model via OpenRouter for a specific subtask. Use this when a specialized model would handle a step better — e.g. Kimi for writing polish, Gemini for analysis, Perplexity for search-grounded answers.

The model runs independently with no memory of your conversation. Pass all necessary context in the prompt.

If no model is specified, the configured default (OPENROUTER_DEFAULT_MODEL) is used.

Common model IDs:
• moonshotai/kimi-k2.5 — long-context editing and writing
• google/gemini-2.5-flash — fast analysis and structured output
• perplexity/sonar-pro — web-grounded research
• openai/gpt-4o — general purpose`,
  {
    model: z.string().optional().describe('OpenRouter model ID. Omit to use the configured default.'),
    prompt: z.string().describe('The full prompt to send, including all necessary context'),
    system: z.string().optional().describe('Optional system prompt'),
    max_tokens: z.number().int().positive().optional().describe('Maximum tokens to generate'),
  },
  async (args) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return {
        content: [{ type: 'text' as const, text: 'OPENROUTER_API_KEY is not configured. Add it to .env.' }],
        isError: true,
      };
    }
    const model = args.model || process.env.OPENROUTER_DEFAULT_MODEL;
    if (!model) {
      return {
        content: [{ type: 'text' as const, text: 'No model specified and OPENROUTER_DEFAULT_MODEL is not configured.' }],
        isError: true,
      };
    }
    const messages: Array<{ role: string; content: string }> = [];
    if (args.system) messages.push({ role: 'system', content: args.system });
    messages.push({ role: 'user', content: args.prompt });
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'nanoclaw',
        },
        body: JSON.stringify({
          model,
          messages,
          ...(args.max_tokens != null ? { max_tokens: args.max_tokens } : {}),
        }),
      });
      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };
      if (!response.ok || data.error) {
        return {
          content: [{ type: 'text' as const, text: `OpenRouter error: ${data.error?.message ?? `HTTP ${response.status}`}` }],
          isError: true,
        };
      }
      return { content: [{ type: 'text' as const, text: data.choices?.[0]?.message?.content ?? '' }] };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Request failed: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  },
);
```

### Forward secret to the nanoclaw MCP server process

Read `container/agent-runner/src/index.ts`. Find the `mcpServers.nanoclaw.env` object. Add the OpenRouter vars to it:

```typescript
mcpServers: {
  nanoclaw: {
    command: 'node',
    args: [mcpServerPath],
    env: {
      NANOCLAW_CHAT_JID: containerInput.chatJid,
      NANOCLAW_GROUP_FOLDER: containerInput.groupFolder,
      NANOCLAW_IS_MAIN: containerInput.isMain ? '1' : '0',
      // BizClaw: forward OpenRouter secrets to MCP server process
      ...(sdkEnv.OPENROUTER_API_KEY ? { OPENROUTER_API_KEY: sdkEnv.OPENROUTER_API_KEY as string } : {}),
      ...(sdkEnv.OPENROUTER_DEFAULT_MODEL ? { OPENROUTER_DEFAULT_MODEL: sdkEnv.OPENROUTER_DEFAULT_MODEL as string } : {}),
    },
  },
```

### Add call_model to allowedTools

In the same file, find `allowedTools` array and add `'mcp__nanoclaw__call_model'` if not already covered by `'mcp__nanoclaw__*'`.

### Update per-group agent-runner source

Existing groups have a cached copy:

```bash
for dir in data/sessions/*/agent-runner-src; do
  cp container/agent-runner/src/ipc-mcp-stdio.ts "$dir/"
  cp container/agent-runner/src/index.ts "$dir/"
done
```

### Build

```bash
npm run build
./container/build.sh
```

Both must succeed before continuing.

## Phase 3: Configure

### Restart the service

```bash
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # macOS
# Linux: systemctl --user restart nanoclaw
```

## Phase 4: Verify

Tell the user:

> Send a message: "use call_model with kimi to write a haiku about TypeScript"

Expected: the agent calls `mcp__nanoclaw__call_model`, passes a prompt, and returns a haiku from Kimi.

### Check logs if needed

```bash
tail -f logs/nanoclaw.log | grep -i "call_model\|openrouter"
```

## Troubleshooting

### "OPENROUTER_API_KEY is not configured"

The secret didn't reach the MCP server process:
1. Verify it's in `.env`
2. Verify `buildContainerArgs` reads and passes it with `-e`
3. Verify `mcpServers.nanoclaw.env` forwards it
4. Restart the service — the container must be freshly spawned to see new env vars

### Agent doesn't use call_model

Try being explicit: "use the call_model tool with model moonshotai/kimi-k2.5 to..."
