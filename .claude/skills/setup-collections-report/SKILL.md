---
name: setup-collections-report
description: Set up a daily collections report for a sales/payments Telegram or WhatsApp group. Queries group messages, analyzes with AI, and emails a formatted report to stakeholders. Use when a client wants automated daily payment/collections summaries.
---

# Setup Collections Report

This skill configures a daily automated collections report for a messaging group (Telegram or WhatsApp). The report queries the last 24 hours of messages, uses AI to extract payment confirmations and pending items, and emails a formatted summary to stakeholders.

## Phase 1: Gather Configuration

Use `AskUserQuestion` to collect:

1. **Source group** — Which Telegram or WhatsApp group contains the collections messages?
   - Ask for the group name; you'll look up the JID from the database
   - If Telegram: JID format is `tg:-XXXXXXXXX`
   - If WhatsApp: JID format is `XXXXXXXXX@g.us`

2. **Report recipients** — Who should receive the daily email? (comma-separated email addresses)

3. **Send time** — What time should the report be sent? (e.g. "8 PM IST", "9 AM UTC")
   - Convert to cron expression: `MM HH * * *` in the system timezone (Asia/Kolkata by default)

4. **Gmail account** — Which Gmail account should send the report?
   - Check `/workspace/group/config.md` first — use that account if configured
   - Otherwise ask the user

5. **AI model** — Which model for analysis? Default: `moonshotai/kimi-k2.5` via OpenRouter
   - Only ask if user wants to change it

## Phase 2: Find the Group JID

Query the database to find the group:

```bash
sqlite3 /workspace/project/store/messages.db "
  SELECT jid, name FROM chats
  WHERE name LIKE '%<group name>%'
  ORDER BY last_message_time DESC
  LIMIT 5;
"
```

Also check registered groups:
```bash
cat /workspace/project/data/registered_groups.json
```

Confirm the JID with the user if multiple matches.

## Phase 3: Convert Send Time to Cron

Convert the requested time to a cron expression.

Examples (system timezone: Asia/Kolkata / IST = UTC+5:30):
- "8 PM IST" → `0 20 * * *`
- "9 AM IST" → `0 9 * * *`
- "7:30 PM IST" → `30 19 * * *`

## Phase 4: Create the Scheduled Task

Use `mcp__nanoclaw__schedule_task` to create the task:

```
schedule_task(
  prompt: <generated prompt — see template below>,
  schedule_type: "cron",
  schedule_value: "<cron expression>",
  context_mode: "isolated"
)
```

**Prompt template** (fill in the placeholders):

```
You are running a daily collections report for <GROUP_NAME>.

1. Query the database for all messages from the last 24 hours:
   sqlite3 /workspace/project/store/messages.db "SELECT sender_name, content, timestamp FROM messages WHERE chat_jid = '<GROUP_JID>' AND timestamp >= strftime('%Y-%m-%dT%H:%M:%S', datetime('now', '-24 hours')) ORDER BY timestamp ASC;"

2. Pass the raw output to mcp__nanoclaw__call_model with model='<MODEL>' to analyze and produce a structured report with these sections:
   - Collections Received (confirmed payments, amounts, clients)
   - Pending Collections (outstanding amounts mentioned)
   - Follow-up Actions Needed
   If there are no messages or no payment activity, note that and still send the email.

3. Send the report via mcp__gmail__send_email:
   - From: <GMAIL_ACCOUNT>
   - To: <RECIPIENTS (comma-separated)>
   - Subject: Daily Collections Report - [today's date]
   - Body: the formatted report
   - Footer: (Analyzed by <MODEL>)

4. Wrap your final completion summary in <internal> tags — the email is the delivery.
```

## Phase 5: Confirm Setup

After creating the task, confirm with the user:

- Show the scheduled time in their local timezone
- Show the recipients
- Offer to send a test report immediately:
  - If yes: create a second `once` task with `schedule_value` set to now (current ISO timestamp)
  - The test task will run within 60 seconds

## Notes

- The scheduled task runs under the WhatsApp main group context (required for database access)
- Only the WhatsApp main group (`MAIN_GROUP_FOLDER`) has `/workspace/project` mounted
- Requires: Gmail MCP configured, OpenRouter API key set, Telegram/WhatsApp group registered
- If OpenRouter is not configured, fall back to Claude for analysis (omit the `model` parameter in `call_model`)
