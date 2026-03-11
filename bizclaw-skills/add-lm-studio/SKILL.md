---
name: add-lm-studio
description: Add local LLM inference via LM Studio running on your network. Zero API cost, fully private. Use when asked to add local models, LM Studio, or private/local LLM support.
---

# Add LM Studio Integration

Adds a `call_lm_studio` MCP tool so the NanoClaw container agent can call locally-hosted models via LM Studio. Zero API cost. Works with any model loaded in LM Studio.

Tool added: `call_lm_studio` — accepts `model` (optional, uses active model if omitted), `prompt`, `system` (optional), `max_tokens` (optional). Calls LM Studio's OpenAI-compatible API. No API key required.

## Phase 1: Pre-flight

### Check if already applied

```bash
grep -n "call_lm_studio\|LM_STUDIO" container/agent-runner/src/ipc-mcp-stdio.ts
```

If found, skip to Phase 3.

### Verify LM Studio is installed and running

LM Studio must be running on the same network as your NanoClaw host with the local server enabled.

1. Open LM Studio → Developer tab → Start Server
2. Note the server address (default: `http://localhost:1234`)
3. If the host machine is different from the machine you're messaging from, use its LAN IP (e.g., `http://192.168.1.11:1234`)

Test connectivity from the NanoClaw host:

```bash
curl -s http://YOUR_LM_STUDIO_HOST:1234/v1/models | head -5
```

You should see a JSON response with available models.

## Phase 2: Apply Code Changes

### Add LM Studio URL to .env

Append to `.env`:

```bash
LM_STUDIO_BASE_URL=http://192.168.1.11:1234/v1
```

Replace `192.168.1.11:1234` with your LM Studio host and port.

Also add to `data/env/env` if it exists:

```bash
echo "LM_STUDIO_BASE_URL=http://192.168.1.11:1234/v1" >> data/env/env
```

### Pass the URL to the container

Read `src/container-runner.ts`. Find `buildContainerArgs`. Add before `args.push(CONTAINER_IMAGE)`:

```typescript
// LM Studio URL
const lmStudioSecrets = readEnvFile(['LM_STUDIO_BASE_URL']);
if (lmStudioSecrets.LM_STUDIO_BASE_URL) {
  args.push('-e', `LM_STUDIO_BASE_URL=${lmStudioSecrets.LM_STUDIO_BASE_URL}`);
}
```

Note: `readEnvFile` is already imported from `./env.js`.

### Register the call_lm_studio tool

Read `container/agent-runner/src/ipc-mcp-stdio.ts`. Add before the final `// Start the stdio transport` comment:

```typescript
server.tool(
  'call_lm_studio',
  `Call a locally-hosted model via LM Studio (running on the local network). Free — no API cost. Use for tasks where a local model is sufficient: drafting, summarising, classification, translation, code explanation.

Omit the model parameter to use whichever model is currently active in LM Studio.

The model runs independently with no memory of your conversation. Pass all necessary context in the prompt.`,
  {
    model: z.string().optional().describe('LM Studio model ID (e.g. "liquid/lfm2-24b-a2b"). Omit to use the currently active model.'),
    prompt: z.string().describe('The full prompt to send, including all necessary context'),
    system: z.string().optional().describe('Optional system prompt'),
    max_tokens: z.number().int().positive().optional().describe('Maximum tokens to generate'),
  },
  async (args) => {
    const baseUrl = process.env.LM_STUDIO_BASE_URL;
    if (!baseUrl) {
      return {
        content: [{ type: 'text' as const, text: 'LM_STUDIO_BASE_URL is not configured. Add it to .env.' }],
        isError: true,
      };
    }
    const messages: Array<{ role: string; content: string }> = [];
    if (args.system) messages.push({ role: 'system', content: args.system });
    messages.push({ role: 'user', content: args.prompt });
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(args.model ? { model: args.model } : {}),
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
          content: [{ type: 'text' as const, text: `LM Studio error: ${data.error?.message ?? `HTTP ${response.status}`}` }],
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

### Forward the URL to the nanoclaw MCP server process

Read `container/agent-runner/src/index.ts`. Find `mcpServers.nanoclaw.env`. Add:

```typescript
...(sdkEnv.LM_STUDIO_BASE_URL ? { LM_STUDIO_BASE_URL: sdkEnv.LM_STUDIO_BASE_URL as string } : {}),
```

### Update per-group agent-runner source

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

## Phase 3: Configure

### Load a model in LM Studio

1. Open LM Studio → Models tab
2. Download a model if you haven't yet (recommendations: `gemma-3-4b`, `llama-3.2-3b`, `qwen2.5-7b`)
3. Click "Load" on a model to make it active

### Restart the service

```bash
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # macOS
# Linux: systemctl --user restart nanoclaw
```

## Phase 4: Verify

Tell the user:

> Make sure a model is loaded in LM Studio, then send: "use call_lm_studio to write a haiku about code"

Expected: the agent calls `mcp__nanoclaw__call_lm_studio` and returns a haiku generated by the local model.

### Check logs

```bash
tail -f logs/nanoclaw.log | grep -i "lm_studio\|call_lm"
```

## Troubleshooting

### "LM_STUDIO_BASE_URL is not configured"

The container didn't receive the env var:
1. Verify `.env` has `LM_STUDIO_BASE_URL`
2. Verify `buildContainerArgs` reads and passes it
3. Verify `mcpServers.nanoclaw.env` forwards it
4. Restart the service — the container must be freshly spawned

### "Request failed: fetch failed" or connection refused

LM Studio's local server is not reachable from inside the container:
1. Verify LM Studio's server is running (Developer tab → green indicator)
2. Check if your container runtime uses a different network bridge:
   - Docker: use `host.docker.internal` instead of `localhost`
   - Apple Container: use the host's LAN IP (e.g., `192.168.1.11`) — `localhost` won't work
3. Test from the host: `curl http://YOUR_LM_STUDIO_URL/v1/models`

### "No model loaded" or empty response

Load a model in LM Studio first. The active model is used when `model` param is omitted. If you want a specific model, pass its ID explicitly.

### Container can't reach LM Studio across network

If LM Studio is on a different machine:
1. In LM Studio: Settings → Local Server → listen on `0.0.0.0` (not just localhost)
2. Check firewall allows port 1234
3. Use the machine's LAN IP in `LM_STUDIO_BASE_URL`
