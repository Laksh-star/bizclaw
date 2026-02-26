---
name: setup-sales-crm
description: Set up a lightweight sales CRM for a WhatsApp or Telegram group. Tracks leads, deals, and pipeline stages. Optionally sends weekly pipeline reports by email. Use when a user wants to track sales, manage contacts, or monitor a pipeline from chat.
---

# Setup Sales CRM

This skill configures a conversational CRM inside an existing WhatsApp or Telegram group. The agent learns to manage leads, deals, and pipeline stages through natural language. Data lives in `groups/{folder}/crm/` as JSON files — readable, portable, no extra infrastructure.

## Phase 1: Gather Configuration

Use `AskUserQuestion` to collect:

1. **CRM group** — Which group should have the CRM? (the agent will track deals in this group's context)
   - Can be the main channel (self-chat) or a dedicated sales group
   - Look up the folder name from `data/registered_groups.json`

2. **Pipeline stages** — What are the stages in your sales pipeline?
   - Suggest defaults: `New Lead → Contacted → Qualified → Proposal Sent → Negotiation → Won → Lost`
   - User can edit — keep it simple (4–7 stages)

3. **Deal fields** — What info to track per deal?
   - Always include: `name`, `stage`, `contact_name`, `contact_phone`, `value` (optional), `notes`
   - Ask if they want additional fields (e.g. `company`, `source`, `expected_close_date`)

4. **Pipeline report** — Do you want a weekly pipeline summary emailed to anyone?
   - If yes: ask for recipients and day/time (e.g. "Monday 9 AM IST")
   - Check `groups/global/config.md` or `groups/{folder}/config.md` for Gmail account
   - If not configured, ask which Gmail account to send from

## Phase 2: Find the Group Folder

Look up the registered group to get its folder name:

```bash
cat /Users/ln/nanoclaw/data/registered_groups.json
```

Or if running inside the container context:
```bash
cat /workspace/project/data/registered_groups.json
```

Match the group name from Phase 1 to its `folder` field. Confirm with the user if ambiguous.

## Phase 3: Initialize CRM Data Directory

Create the CRM directory and initial files in the group folder:

```bash
mkdir -p groups/<FOLDER>/crm
```

Create `groups/<FOLDER>/crm/config.json`:
```json
{
  "stages": ["New Lead", "Contacted", "Qualified", "Proposal Sent", "Negotiation", "Won", "Lost"],
  "fields": ["name", "stage", "contact_name", "contact_phone", "value", "notes"],
  "currency": "INR",
  "created_at": "<ISO timestamp>"
}
```

Create `groups/<FOLDER>/crm/deals.json`:
```json
[]
```

Create `groups/<FOLDER>/crm/contacts.json`:
```json
[]
```

Use the actual stages and fields the user chose. Set `currency` based on their context (ask if unclear — default `INR` for Indian businesses).

## Phase 4: Update Group CLAUDE.md

Append CRM instructions to `groups/<FOLDER>/CLAUDE.md`. Read the file first to check if CRM section already exists.

Append this block (replace placeholders):

```markdown
## Sales CRM

You manage a lightweight sales CRM for this group. Data lives in `/workspace/group/crm/`.

### Pipeline Stages
<STAGE_1> → <STAGE_2> → ... → Won / Lost

### Commands You Understand

**Add a lead:**
"Add lead: [name], [company], [phone], [value]"
→ Append to `/workspace/group/crm/deals.json` with stage = "New Lead", id = timestamp-slug, created_at = now.

**Update stage:**
"Move [deal name] to [stage]" or "[deal name] is won"
→ Find deal by name (fuzzy), update stage and updated_at.

**Add note:**
"Note on [deal name]: [text]"
→ Append to deal's notes array with timestamp.

**Show pipeline:**
"Show pipeline" or "What's in my pipeline?"
→ Read deals.json, group by stage, show counts and values. Format as a clean text summary.

**Stage details:**
"What's in [stage]?" or "Show [stage] deals"
→ List deals in that stage with contact info and value.

**Search:**
"Find [name]" or "Search [company]"
→ Fuzzy search deals.json and contacts.json, return matches.

**Schedule follow-up:**
"Follow up on [deal name] on [date/time]"
→ Use mcp__nanoclaw__schedule_task with a once task: "Reminder: follow up on [deal name]. Current status: [stage]. Notes: [notes]". Send reminder to this group's JID.

**Won/Lost:**
"[Deal name] is won" / "[Deal name] is lost [optional reason]"
→ Update stage to Won/Lost, set closed_at = now, record reason if given.

**Weekly summary (if asked):**
"Send pipeline report" or "Email pipeline summary"
→ Generate summary grouped by stage, email via mcp__gmail__send_email.

### Data Format (deals.json entry)
```json
{
  "id": "deal-<slug>-<timestamp>",
  "name": "Deal name",
  "stage": "New Lead",
  "contact_name": "Name",
  "contact_phone": "+91XXXXXXXXXX",
  "value": 50000,
  "currency": "INR",
  "notes": [{"text": "...", "at": "ISO timestamp"}],
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp",
  "closed_at": null
}
```

### Rules
- Always confirm before deleting a deal. Never delete — mark as Lost instead.
- When reading deals.json, parse it with bash: `cat /workspace/group/crm/deals.json`
- When writing, read first → modify in memory → write back the full JSON array.
- Use `jq` for JSON manipulation when available, otherwise use node -e with JSON.parse/stringify.
- Keep deal names short and searchable. Strip company suffixes (Pvt Ltd, Inc) from the id slug.
- Value is always a number (no currency symbol in the field). Show currency when displaying.
```

## Phase 5: Set Up Weekly Report (If Requested)

If the user wants a weekly pipeline email report, create a scheduled task.

Convert their requested time to a cron expression. Weekly cron: `MM HH * * D` where D = 0 (Sunday) through 6 (Saturday).

Examples (IST timezone):
- "Monday 9 AM IST" → `0 9 * * 1`
- "Friday 6 PM IST" → `0 18 * * 5`

Use `mcp__nanoclaw__schedule_task`:
```
schedule_task(
  prompt: <see template below>,
  schedule_type: "cron",
  schedule_value: "<cron expression>",
  context_mode: "isolated"
)
```

**Weekly report prompt template:**
```
You are generating a weekly sales pipeline report.

1. Read the pipeline data:
   cat /workspace/group/crm/deals.json

2. Read the pipeline config for stages:
   cat /workspace/group/crm/config.json

3. Analyze the data and produce a pipeline report with:
   - Pipeline summary: count and total value per stage
   - Active deals (not Won/Lost): list with contact, value, last note
   - Deals closed this week (Won or Lost since 7 days ago)
   - Deals with no update in 7+ days (need follow-up)
   - Total pipeline value (sum of all active deals)

4. Send via mcp__gmail__send_email:
   - From: <GMAIL_ACCOUNT>
   - To: <RECIPIENTS>
   - Subject: Weekly Pipeline Report — [week ending date]
   - Body: the formatted report

5. Wrap your completion summary in <internal> tags — the email is the delivery.
```

## Phase 6: Confirm and Test

After setup, confirm with the user:
- Show the pipeline stages configured
- Show the CRM folder location (`groups/<FOLDER>/crm/`)
- If weekly report is set: show schedule and recipients
- Offer to add a test deal to verify it's working:
  - If yes: ask for a real or dummy deal name, add it to deals.json, then ask the user to send "Show pipeline" in the configured group to verify the agent responds correctly

## Notes

- The agent handles all CRM logic through natural language — no commands to memorize, just describe what you want
- Data files are plain JSON — readable and editable directly if needed
- The group must be registered and have a running container for the agent to respond
- Weekly reports run under the main group context (same constraint as collections reports)
- For the weekly report to work: Gmail MCP must be configured and the group must have `/workspace/project` mounted (main group only) OR use group-local paths only
- If the CRM group is NOT the main group: the weekly report prompt must use only `/workspace/group/crm/` paths (not `/workspace/project/`)
