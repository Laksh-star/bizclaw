# NanoClaw Debug Checklist

## Known Issues

### 1. [FIXED] Resume branches from stale tree position
When agent teams spawns subagent CLI processes, they write to the same session JSONL. On subsequent `query()` resumes, the CLI reads the JSONL but may pick a stale branch tip (from before the subagent activity), causing the agent's response to land on a branch the host never receives a `result` for. **Fix**: pass `resumeSessionAt` with the last assistant message UUID to explicitly anchor each resume.

### 2. IDLE_TIMEOUT == CONTAINER_TIMEOUT (both 30 min)
Both timers fire at the same time, so containers always exit via hard SIGKILL (code 137) instead of graceful `_close` sentinel shutdown. The idle timeout should be shorter (e.g., 5 min) so containers wind down between messages, while container timeout stays at 30 min as a safety net for stuck agents.

### 3. Cursor advanced before agent succeeds
`processGroupMessages` advances `lastAgentTimestamp` before the agent runs. If the container times out, retries find no messages (cursor already past them). Messages are permanently lost on timeout.

### 4. [FIXED 2026-02-21] Baileys null vs undefined — all text messages treated as images
`isImageMessage` used `!== undefined`. Protobuf unset fields are `null`, not `undefined`, so `null !== undefined` is `true`, causing every text message to match. **Fix**: use `!= null` (loose equality) for all Baileys field checks.

### 5. [FIXED 2026-02-21] Image/PDF content blocks not delivered to agent
When an image was processed into `ContentBlock[]`, the host's piping path (`queue.sendMessage`) explicitly replaced it with `'[New media message - please check WhatsApp]'` before sending to an already-running container. Even for fresh containers, `agent-runner`'s `MessageStream.push` and `SDKUserMessage.message.content` were typed as `string` only. **Fix**: typed the entire pipeline to accept `string | object[]` and removed the placeholder substitution.

---

## Quick Status Check

```bash
# 1. Is the service running?
launchctl list | grep com.nanoclaw
# Expected: PID  0  com.nanoclaw (PID = running, "-" = not running, non-zero exit = crashed)

# 2. Any running containers?
container ls --format json 2>/dev/null | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');JSON.parse(d||'[]').filter(c=>c.configuration.id.startsWith('nanoclaw-')&&c.status==='running').forEach(c=>console.log(c.configuration.id,c.status))"

# 3. Any stopped/orphaned containers?
container ls -a --format json 2>/dev/null | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');JSON.parse(d||'[]').filter(c=>c.configuration.id.startsWith('nanoclaw-')).forEach(c=>console.log(c.configuration.id,c.status))"

# 4. Recent errors in service log?
grep -E 'ERROR|WARN' logs/nanoclaw.log | tail -20

# 5. Is WhatsApp connected?
grep -E 'Connected to WhatsApp|Connection closed|connection.*close' logs/nanoclaw.log | tail -5

# 6. Are groups loaded?
grep 'groupCount' logs/nanoclaw.log | tail -3

# 7. Disk space (Apple Container stores VMs here)
df -h / && du -sh ~/Library/Application\ Support/com.apple.container/containers/ 2>/dev/null
```

---

## Agent Not Responding

```bash
# Check if messages are being received from WhatsApp
grep 'New messages' logs/nanoclaw.log | tail -10

# Check if messages are being processed (container spawned)
grep -E 'Processing messages|Spawning container' logs/nanoclaw.log | tail -10

# Check if messages are being piped to active container
grep -E 'Piped messages|sendMessage' logs/nanoclaw.log | tail -10

# Check trigger — groups require @Andy prefix; main/self-chat does not
sqlite3 store/messages.db "SELECT name, trigger_pattern, requires_trigger FROM registered_groups"

# Check lastAgentTimestamp vs latest message timestamp
sqlite3 store/messages.db "SELECT chat_jid, MAX(timestamp) as latest FROM messages GROUP BY chat_jid ORDER BY latest DESC LIMIT 5;"
```

## Clear Message Queue (stop Andy responding to old messages)

```bash
# Stop service, bump all timestamps to now, restart
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist

NOW=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
NEW_JSON=$(sqlite3 store/messages.db "SELECT value FROM router_state WHERE key = 'last_agent_timestamp'" | \
  node -e "const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>{const o=JSON.parse(c.join(''));const n='$NOW';Object.keys(o).forEach(k=>o[k]=n);console.log(JSON.stringify(o))})")
sqlite3 store/messages.db "UPDATE router_state SET value = '$NEW_JSON' WHERE key = 'last_agent_timestamp'"
sqlite3 store/messages.db "UPDATE router_state SET value = '$NOW' WHERE key = 'last_timestamp'"

launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
```

## Clear Stale Session Context (Andy referencing old/broken conversations)

Sessions resume full conversation history. After bugs that put bad content into history, clear them:

```bash
sqlite3 store/messages.db "DELETE FROM sessions"
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

---

## Image / Media Not Working

```bash
# Check if image was detected and downloaded
grep -E 'Attempting to download|Processed image|Image processing error' logs/nanoclaw.log | tail -10

# If "Image processing error" appears with a text message → null check bug
# isImageMessage must use != null (not !== undefined). Baileys sets unset fields to null.

# Check if content blocks reached the agent
grep -E 'Spawning container|Agent output' logs/nanoclaw.log | tail -10
# If agent says "I see there's a media message but can't access it" → pipeline type bug
# Verify group-queue.ts sendMessage accepts object[], agent-runner drainIpcInput returns (string|object[])[]
```

---

## Session Transcript Branching

```bash
# Check for concurrent CLI processes in session debug logs
ls -la data/sessions/<group>/.claude/debug/

# Check parentUuid branching in transcript
python3 -c "
import json, sys
lines = open('data/sessions/<group>/.claude/projects/-workspace-group/<session>.jsonl').read().strip().split('\n')
for i, line in enumerate(lines):
  try:
    d = json.loads(line)
    if d.get('type') == 'user' and d.get('message'):
      parent = d.get('parentUuid', 'ROOT')[:8]
      content = str(d['message'].get('content', ''))[:60]
      print(f'L{i+1} parent={parent} {content}')
  except: pass
"
```

---

## Container Timeout Investigation

```bash
# Check for recent timeouts
grep -E 'Container timeout|timed out' logs/nanoclaw.log | tail -10

# Check container log files for the timed-out container
ls -lt groups/*/logs/container-*.log | head -10

# Read the most recent container log
cat groups/<group>/logs/container-<timestamp>.log

# Check if retries were scheduled
grep -E 'Scheduling retry|retry|Max retries' logs/nanoclaw.log | tail -10
```

---

## Disk Cleanup (Apple Container)

Containers accumulate in `~/Library/Application Support/com.apple.container/`. Check and clean:

```bash
# See what's using space
for d in containers content snapshots; do
  echo -n "$d: "; du -sh ~/Library/Application\ Support/com.apple.container/$d 2>/dev/null | cut -f1
done

# Remove all stopped nanoclaw containers
container ls -a --format json 2>/dev/null | \
  node -e "const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>{JSON.parse(c.join('')||'[]').filter(x=>x.configuration.id.startsWith('nanoclaw-')&&x.status!=='running').forEach(x=>{require('child_process').execSync('container rm '+x.configuration.id);console.log('removed',x.configuration.id)})})"

# Free the base image (3.8GB — re-fetched automatically on next build)
container image rm node:22-slim

# Stop and remove the builder cache
container builder stop && container builder rm
```

Note: `--rm` is already set on all agent container runs, so containers auto-remove on normal exit. Stopped containers only accumulate from timeout-killed containers. `cleanupOrphans()` handles these automatically at service startup.

---

## Container Mount Issues

```bash
# Check mount validation logs (shows on container spawn)
grep -E 'Mount validated|Mount.*REJECTED|mount' logs/nanoclaw.log | tail -10

# Verify the mount allowlist is readable
cat ~/.config/nanoclaw/mount-allowlist.json

# Check group's container_config in DB
sqlite3 store/messages.db "SELECT name, container_config FROM registered_groups;"

# Test-run a container to check mounts
container run -i --rm --entrypoint ls nanoclaw-agent:latest /workspace/extra/
```

---

## WhatsApp Auth Issues

```bash
# Check if QR code was requested (means auth expired)
grep 'QR\|authentication required\|qr' logs/nanoclaw.log | tail -5

# Check auth files exist
ls -la store/auth/

# Re-authenticate if needed
npm run auth
```

---

## Service Management

```bash
# Restart the service
launchctl kickstart -k gui/$(id -u)/com.nanoclaw

# View live logs
tail -f logs/nanoclaw.log

# Stop the service
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist

# Start the service
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist

# Rebuild after host code changes
npm run build && launchctl kickstart -k gui/$(id -u)/com.nanoclaw

# Rebuild after agent-runner changes (requires container rebuild)
npm run build && ./container/build.sh && launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```
