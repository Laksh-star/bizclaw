---
name: add-telegram-streaming
description: Add real-time response streaming to Telegram DMs using Bot API 9.5 sendMessageDraft. Users see responses being typed word-by-word instead of waiting for the full reply. Use when asked to add Telegram streaming or improve Telegram response UX.
---

# Add Telegram Streaming

Uses Telegram Bot API 9.5's `sendMessageDraft` method (released Mar 2026) to stream agent responses into the Telegram compose box. Users see the response appearing as the agent writes it — no waiting for the full reply.

**Requirements:**
- Telegram channel must already be set up (run `/add-telegram` first if needed)
- Bot API 9.5+ (available from March 2026)
- Works in DMs only — group chats fall back to normal `sendMessage`

## Phase 1: Pre-flight

### Check Telegram channel exists

```bash
grep -r "TelegramChannel\|grammy" src/channels/
```

If no Telegram channel file found, run `/add-telegram` first.

### Check if already applied

```bash
grep -n "streamPartial\|sendMessageDraft" src/channels/telegram.ts src/index.ts 2>/dev/null
```

If both are found, streaming is already implemented.

### Check grammY version supports sendMessageDraft

```bash
grep "grammy" package.json
```

`grammy` must be `^1.35.0` or later. If older, update:

```bash
npm install grammy@latest
```

## Phase 2: Apply Code Changes

### Add streamPartial to the Telegram channel

Read `src/channels/telegram.ts`. Find the class definition for the Telegram channel (it will implement a `Channel` interface with methods like `sendMessage`, `isConnected`, `disconnect`).

Add the `streamPartial` method to the class (after `setTyping` if it exists, before the closing `}`):

```typescript
async streamPartial(jid: string, draftId: number, text: string): Promise<void> {
  if (!this.bot) return;
  const numericId = parseInt(jid.replace(/^tg:/, ''), 10);
  // sendMessageDraft only works in private chats (positive chat IDs)
  if (numericId <= 0) return;
  const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;
  const truncated = text.length > TELEGRAM_MAX_MESSAGE_LENGTH
    ? text.slice(0, TELEGRAM_MAX_MESSAGE_LENGTH)
    : text;
  try {
    await this.bot.api.sendMessageDraft(numericId, draftId, truncated);
  } catch (err) {
    // Log at debug level — drafts fail silently if the API version doesn't support it
    logger.debug({ jid, err }, 'Failed to send Telegram message draft');
  }
}
```

Note: `logger` is already imported in `telegram.ts`.

### Wire streaming in the orchestrator

Read `src/index.ts`. Find the `onOutput` callback passed to `runAgent` (or `runContainerAgent`). It handles streaming results and calls `channel.sendMessage`.

Add a stable `draftId` before the `runAgent` call:

```typescript
// Stable draft ID for this response session (non-zero, fits in a 32-bit int)
const draftId = (Date.now() % 2_000_000_000) + 1;
```

Inside the `onOutput` callback, add handling for `result.partial` before the existing `result.result` handling:

```typescript
// Streaming partial — update the Telegram draft preview
if (result.partial) {
  const partialText = stripInternalTags(result.partial);
  if (partialText) {
    await channel.streamPartial?.(chatJid, draftId, partialText);
  }
  return;
}
```

Note: `stripInternalTags` is likely already imported from `./router.js`. If not, add a simple inline stripper:

```typescript
function stripInternalTags(text: string): string {
  return text.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();
}
```

### Verify the Channel interface allows streamPartial

Read `src/types.ts`. Find the `Channel` interface. If `streamPartial` is not declared, add it as optional:

```typescript
streamPartial?(jid: string, draftId: number, text: string): Promise<void>;
```

### Build

```bash
npm run build
```

Build must be clean before continuing.

## Phase 3: Configure

### Restart the service

```bash
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # macOS
# Linux: systemctl --user restart nanoclaw
```

## Phase 4: Verify

### Test streaming in a Telegram DM

Tell the user:

> Send a longer question to the bot in a private DM (not a group) — something that requires a multi-sentence answer.

Expected: you'll see the bot's response appearing in the compose box as it's being generated, then it commits as a sent message when complete.

### Check logs

```bash
tail -f logs/nanoclaw.log | grep -i "draft\|partial\|stream"
```

Look for: `Failed to send Telegram message draft` at debug level — this is normal if the API version doesn't support it yet, but should not appear with Bot API 9.5+.

## Troubleshooting

### No streaming visible

1. Make sure you're in a DM (not a group chat)
2. Confirm the `streamPartial` method is on the channel class
3. Confirm the `onOutput` callback has the `result.partial` check
4. Confirm the agent-runner emits PARTIAL markers — grep for `writePartial` in `container/agent-runner/src/index.ts`

### "sendMessageDraft is not a function"

Your grammY version doesn't support this API. Update:

```bash
npm install grammy@latest
npm run build
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

### Streaming works but shows reasoning artifacts

The agent is using `<internal>...</internal>` tags that aren't being stripped. Verify the `stripInternalTags` call is wrapping `result.partial` before passing to `channel.streamPartial`.
