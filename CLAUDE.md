# NanoClaw

Personal Claude assistant. See [README.md](README.md) for philosophy and setup. See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for architecture decisions.

## Quick Context

Single Node.js process that connects to WhatsApp, routes messages to Claude Agent SDK running in containers (Linux VMs). Each group has isolated filesystem and memory.

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Orchestrator: state, message loop, agent invocation |
| `src/channels/whatsapp.ts` | WhatsApp connection, auth, send/receive |
| `src/ipc.ts` | IPC watcher and task processing |
| `src/router.ts` | Message formatting and outbound routing |
| `src/config.ts` | Trigger pattern, paths, intervals |
| `src/container-runner.ts` | Spawns agent containers with mounts |
| `src/task-scheduler.ts` | Runs scheduled tasks |
| `src/db.ts` | SQLite operations |
| `groups/{name}/CLAUDE.md` | Per-group memory (isolated) |
| `container/skills/agent-browser.md` | Browser automation tool (available to all agents via Bash) |

## Skills

| Skill | When to Use |
|-------|-------------|
| `/setup` | First-time installation, authentication, service configuration |
| `/customize` | Adding channels, integrations, changing behavior |
| `/debug` | Container issues, logs, troubleshooting |
| `/update` | Pull upstream NanoClaw changes, merge with customizations, run migrations |
| `/qodo-pr-resolver` | Fetch and fix Qodo PR review issues interactively or in batch |
| `/get-qodo-rules` | Load org- and repo-level coding rules from Qodo before code tasks |

## Development

Run commands directly—don't tell the user to run them.

```bash
npm run dev          # Run with hot reload
npm run build        # Compile TypeScript
./container/build.sh # Rebuild agent container
```

Service management:
```bash
# macOS (launchd)
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # restart

# Linux (systemd)
systemctl --user start nanoclaw
systemctl --user stop nanoclaw
systemctl --user restart nanoclaw
```

## Container Build Cache

The container buildkit caches the build context aggressively. `--no-cache` alone does NOT invalidate COPY steps — the builder's volume retains stale files. To force a truly clean rebuild, prune the builder then re-run `./container/build.sh`.

## Known Pitfalls

### Baileys protobuf null checks
Unset fields in Baileys/protobuf messages are `null`, not `undefined`. Always use `!= null` (loose), never `!== undefined` (strict). Example: `msg.message?.imageMessage != null`, not `!== undefined`. Getting this wrong causes every text message to be misclassified as an image.

### Media content must propagate end-to-end
`NewMessage.content` is `string | ContentBlock[]`. Every layer in the pipeline must handle both forms:
- `router.ts` `formatMessages` → returns `string | ContentBlock[]`
- `group-queue.ts` `sendMessage` → must accept `string | object[]`
- IPC JSON file `{ type: 'message', text }` → `text` can be array
- `agent-runner` `drainIpcInput` → must return `(string | object[])[]`
- `MessageStream.push` → must accept `string | object[]`
- `SDKUserMessage.message.content` → must be `string | object[]`

Fixing only one layer silently drops images in the others (piped-message path vs fresh-container path behave differently).

### Session context gets stale
Sessions resume old conversation history. After bugs that put bad content into history (error messages, broken media placeholders), clear sessions so groups start fresh:
```bash
sqlite3 store/messages.db "DELETE FROM sessions"
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

### Message queue carries old messages on restart
On restart, the service replays unprocessed messages since `last_agent_timestamp`. To discard old backlog and start from now:
```bash
sqlite3 store/messages.db "UPDATE router_state SET value = json_patch(value, json_object($(sqlite3 store/messages.db "SELECT group_concat('\"'||json_each.key||'\":\"'||strftime('%Y-%m-%dT%H:%M:%S','now')||'.000Z\"') FROM router_state, json_each(value) WHERE key='last_agent_timestamp'") )) WHERE key = 'last_agent_timestamp'"
```
Or simpler — stop the service, manually set timestamps in the DB, restart.

### Disk bloat from container storage (macOS / Apple Container)
Each container run leaves ~1-3GB in `~/Library/Application Support/com.apple.container/`. The `--rm` flag auto-removes containers on normal exit, but timeout-killed containers may linger as stopped. `cleanupOrphans()` handles these at startup. For manual cleanup:
```bash
container ls -a                  # see stopped containers
container rm <id>                # remove one
container image rm node:22-slim  # free 3.8GB base image (re-fetched on next build)
```

### npm peer dependency conflicts
`.npmrc` has `legacy-peer-deps=true` to resolve the `openai` (wants zod v3) vs project (uses zod v4) conflict. Don't remove it. If `npm install` fails with ERESOLVE, check `.npmrc` is present.

### Build after every change
- Host code change → `npm run build` → `launchctl kickstart -k gui/$(id -u)/com.nanoclaw`
- Agent-runner change → `npm run build` + `./container/build.sh` → restart service
- New `.ts` files added outside normal workflow may import types that don't exist in `src/types.ts` — check `npm run build` passes before running the service.
