---
name: add-tavily-search
description: Replace NanoClaw's basic web search with Tavily structured search. Returns cited, organized results instead of raw HTML scraping. Use when asked to add Tavily, improve web search, or add cited search.
---

# Add Tavily Search Integration

Replaces NanoClaw's built-in `WebSearch`/`WebFetch` tools with Tavily's structured search API. Tavily returns clean, cited results with summaries — ideal for research and fact-checking tasks.

MCP server added: `mcp__tavily__*` — tools like `tavily_search`, `tavily_extract` become available to the agent.

## Phase 1: Pre-flight

### Check if already applied

```bash
grep -n "tavily" container/agent-runner/src/index.ts
```

If found with an MCP server entry, skip to Phase 3.

### Get a Tavily API key

Sign up at https://tavily.com and get an API key from the dashboard.

## Phase 2: Apply Code Changes

### Add API key to .env

Append to `.env`:

```bash
TAVILY_API_KEY=tvly-...
```

Also add to `data/env/env` if it exists:

```bash
echo "TAVILY_API_KEY=tvly-..." >> data/env/env
```

### Pass secret to container

Read `src/container-runner.ts`. Find `buildContainerArgs`. Add before `args.push(CONTAINER_IMAGE)`:

```typescript
// Tavily search secret
const tavilySecrets = readEnvFile(['TAVILY_API_KEY']);
if (tavilySecrets.TAVILY_API_KEY) {
  args.push('-e', `TAVILY_API_KEY=${tavilySecrets.TAVILY_API_KEY}`);
}
```

### Install tavily-mcp in the container image

Read `container/Dockerfile`. Find the `npm install -g` line(s) near the bottom of the image setup. Add `tavily-mcp` to the global installs:

```dockerfile
RUN npm install -g \
    @anthropic-ai/claude-code \
    tavily-mcp \
    # ... existing packages ...
```

If there's no existing global npm install block, add one before the `COPY` or `ENTRYPOINT`:

```dockerfile
RUN npm install -g tavily-mcp
```

### Register the Tavily MCP server

Read `container/agent-runner/src/index.ts`. Find `mcpServers: {` in the `query()` call options. Add the Tavily server alongside the existing ones:

```typescript
tavily: {
  command: 'tavily-mcp',
  args: [],
  env: {
    TAVILY_API_KEY: sdkEnv.TAVILY_API_KEY as string || '',
  },
},
```

### Add Tavily to allowedTools

In the same file, find the `allowedTools` array. Add:

```typescript
'mcp__tavily__*',
```

### Update per-group agent-runner source

```bash
for dir in data/sessions/*/agent-runner-src; do
  cp container/agent-runner/src/index.ts "$dir/"
done
```

### Build

```bash
npm run build
./container/build.sh
```

Container rebuild is required because the Dockerfile was changed.

## Phase 3: Configure

### Restart the service

```bash
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # macOS
# Linux: systemctl --user restart nanoclaw
```

## Phase 4: Verify

Tell the user:

> Send a message: "search for the latest news about Claude AI using Tavily"

Expected: the agent calls a `mcp__tavily__tavily_search` tool and returns results with source citations.

### Check logs if needed

```bash
tail -f logs/nanoclaw.log | grep -i tavily
```

## Troubleshooting

### "command not found: tavily-mcp"

The npm global install didn't work. Check the Dockerfile change was made, then run `./container/build.sh` again.

To verify inside the container image:

```bash
docker run --rm nanoclaw-agent which tavily-mcp
```

### Agent uses WebSearch instead of Tavily

Either:
1. The MCP server entry wasn't added to `mcpServers` — re-read `index.ts` to confirm
2. The container needs to be rebuilt — run `./container/build.sh`
3. The per-group source wasn't updated — re-run the copy loop above

### "TAVILY_API_KEY is not configured"

The key didn't reach the container. Verify the `buildContainerArgs` change and that `.env` has the key.
