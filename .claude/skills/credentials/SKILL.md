---
name: credentials
description: Manage browser sessions and credentials for automating tasks across websites. Save cookies, load sessions, and enable persistent browser automation.
allowed-tools: Bash, Read, Write, Edit
---

# Credential Management Skill

Securely manage browser cookies and sessions to enable Andy to automate tasks on websites where you're logged in.

## Quick Start

### Save Cookies
When the user provides exported cookies from their browser:
```
User: "Save these cookies for godaddy: [JSON data]"
Andy: Saves to /workspace/group/credentials/cookies/godaddy-cookies.json
```

### Load Session for Browser Task
```bash
# Before using agent-browser on a logged-in site:
agent-browser open https://godaddy.com
agent-browser cookies import /workspace/group/credentials/cookies/godaddy-cookies.json
agent-browser open https://godaddy.com/domainsearch
# Now authenticated as user
```

### Save Session State
```bash
# After completing a task, save state for next time:
agent-browser state save /workspace/group/credentials/sessions/godaddy-session.json
```

## Directory Structure

```
/workspace/group/credentials/
├── cookies/              # Exported browser cookies
│   ├── godaddy-cookies.json
│   ├── amazon-cookies.json
│   └── linkedin-cookies.json
├── sessions/            # Saved browser states
│   ├── godaddy-session.json
│   └── squarespace-session.json
└── api-keys/           # API tokens
    └── openai.txt
```

## Commands

### Save Credentials

**Save cookies from user:**
```
When user says: "Save these cookies for <sitename>: <JSON>"
1. Extract sitename (lowercase, no spaces)
2. Write JSON to /workspace/group/credentials/cookies/<sitename>-cookies.json
3. Confirm: "✓ Saved <sitename> cookies (expires in X days)"
```

**Save browser state:**
```bash
agent-browser state save /workspace/group/credentials/sessions/<sitename>-session.json
```

### Load Credentials

**Auto-detect and load:**
```
When user asks to do something on a site (e.g., "Buy X on GoDaddy"):
1. Check if credentials exist for that site
2. Load cookies before navigating
3. Proceed with task
```

**Manual load:**
```bash
# Load cookies only
agent-browser cookies import /workspace/group/credentials/cookies/<sitename>-cookies.json

# Load full session state
agent-browser state load /workspace/group/credentials/sessions/<sitename>-session.json
```

### List Credentials

**Show what's saved (recommended):**
```bash
cd /workspace/group/credentials && ./manage.sh list
```

**Alternative (manual):**
```bash
ls -lh /workspace/group/credentials/cookies/
ls -lh /workspace/group/credentials/sessions/
```

Output format:
```
=== Saved Credentials ===

Cookies:
• godaddy-cookies.json (12 KB, modified 2 days ago)
• amazon-cookies.json (8 KB, modified 1 week ago)

Sessions:
• godaddy-session.json (saved yesterday)
```

### Delete Credentials

**Remove specific site (recommended):**
```bash
cd /workspace/group/credentials && ./manage.sh delete <sitename>
```

**Alternative (manual):**
```bash
rm /workspace/group/credentials/cookies/<sitename>-cookies.json
rm /workspace/group/credentials/sessions/<sitename>-session.json
```

**Remove all:**
```bash
rm -rf /workspace/group/credentials/cookies/*
rm -rf /workspace/group/credentials/sessions/*
```

### Helper Script

A credential management helper script is available at `/workspace/group/credentials/manage.sh`:

```bash
# List all credentials
./manage.sh list

# Check if credentials exist for a site
./manage.sh check godaddy

# Delete credentials for a site
./manage.sh delete godaddy

# Clean expired cookies
./manage.sh clean-expired
```

## Cookie Format

Expected JSON format (from Cookie-Editor or EditThisCookie):
```json
[
  {
    "domain": ".godaddy.com",
    "name": "auth_token",
    "value": "abc123...",
    "path": "/",
    "expires": 1735689600,
    "httpOnly": true,
    "secure": true
  }
]
```

## Common Workflows

### Workflow 1: First-time Setup
```
User: "Save these cookies for godaddy: [paste JSON]"
Andy:
  1. Write to credentials/cookies/godaddy-cookies.json
  2. Confirm saved
  3. Ready for future GoDaddy tasks
```

### Workflow 2: Automated Task with Saved Credentials
```
User: "Buy bizclaw.io on GoDaddy"
Andy:
  1. Check: credentials/cookies/godaddy-cookies.json exists
  2. agent-browser open godaddy.com
  3. agent-browser cookies import credentials/cookies/godaddy-cookies.json
  4. Navigate to domain search
  5. Complete purchase
  6. Save updated session state
```

### Workflow 3: Update Expired Credentials
```
User: "Update my GoDaddy cookies: [new JSON]"
Andy:
  1. Overwrite credentials/cookies/godaddy-cookies.json
  2. Confirm updated
```

### Workflow 4: Multi-site Task
```
User: "Buy domain on GoDaddy, then post about it on LinkedIn"
Andy:
  1. Load godaddy-cookies.json → buy domain
  2. Save GoDaddy state
  3. Close browser
  4. Load linkedin-cookies.json → post update
  5. Save LinkedIn state
```

## Site Detection

Auto-detect site from user requests:
- "GoDaddy" / "godaddy.com" → godaddy-cookies.json
- "Amazon" / "amazon.com" → amazon-cookies.json
- "LinkedIn" / "linkedin.com" → linkedin-cookies.json
- "Namecheap" → namecheap-cookies.json
- "Squarespace" → squarespace-cookies.json

Normalize to: lowercase, remove spaces, remove .com/etc.

## Security Best Practices

### ✅ Do:
- Store cookies locally in /workspace/group/credentials/
- Use .gitignore to prevent committing
- Inform user when cookies expire
- Delete credentials when user requests

### ⚠️ Warn User:
- Banking sites (suggest read-only access)
- Cryptocurrency exchanges
- Medical records
- Password managers

### ❌ Don't:
- Send cookies to external services
- Log cookie contents
- Store in cloud/git
- Keep after user says delete

## Error Handling

**Cookies not found:**
```
When user asks to use a site without saved credentials:
"I don't have saved credentials for <site>. Would you like to:
1. Export cookies from your browser (I'll guide you)
2. Complete this manually in your browser
3. Use a different site"
```

**Cookies expired:**
```
When login fails despite having cookies:
"Your <site> session may have expired. Please:
1. Export fresh cookies from your browser
2. Send them to me to update"
```

**Invalid JSON:**
```
When user provides malformed cookie data:
"The cookie format looks incorrect. Please:
1. Ensure you exported as JSON (not Netscape format)
2. Copy the entire output
3. Try again"
```

## Examples

### Example 1: Save GoDaddy Cookies
```
User: "Here are my GoDaddy cookies: [{\"domain\":\".godaddy.com\",\"name\":\"auth_token\",\"value\":\"xyz\"}]"

Andy:
1. Extract sitename: "godaddy"
2. Write JSON to credentials/cookies/godaddy-cookies.json
3. Response: "✓ Saved GoDaddy cookies to credentials/cookies/godaddy-cookies.json
   Ready to use for GoDaddy automation!"
```

### Example 2: Use Saved Credentials
```
User: "Search for bizclaw.io on GoDaddy and add to cart"

Andy:
1. Check if credentials/cookies/godaddy-cookies.json exists → YES
2. agent-browser open https://godaddy.com
3. agent-browser cookies import credentials/cookies/godaddy-cookies.json
4. agent-browser open https://godaddy.com/domainsearch
5. Fill search: "bizclaw.io"
6. Click "Add to Cart"
7. Save state: agent-browser state save credentials/sessions/godaddy-session.json
8. Response: "✓ Added bizclaw.io to cart ($59.99). Ready for checkout?"
```

### Example 3: List Credentials
```
User: "What credentials do I have saved?"

Andy:
1. ls credentials/cookies/
2. ls credentials/sessions/
3. Response:
   "Saved credentials:
   Cookies:
   • godaddy-cookies.json (12 KB, 2 days old)
   • amazon-cookies.json (8 KB, 1 week old)

   Sessions:
   • godaddy-session.json (saved yesterday)"
```

### Example 4: Delete Credentials
```
User: "Delete my GoDaddy credentials"

Andy:
1. rm credentials/cookies/godaddy-cookies.json
2. rm credentials/sessions/godaddy-session.json
3. Response: "✓ Deleted all GoDaddy credentials. Your cookies are now invalid."
```

## Integration with Agent-Browser

Always use this pattern for authenticated browser tasks:

```bash
# 1. Start browser
agent-browser open <site-url>

# 2. Load credentials
agent-browser cookies import /workspace/group/credentials/cookies/<sitename>-cookies.json

# 3. Navigate to actual task page
agent-browser open <task-specific-url>

# 4. Perform task
# ... (clicks, fills, etc.)

# 5. Save updated state
agent-browser state save /workspace/group/credentials/sessions/<sitename>-session.json

# 6. Close browser
agent-browser close
```

## Troubleshooting

**"Login still failing after loading cookies"**
1. Cookies may have expired → ask for fresh export
2. Site may use additional security (2FA) → inform user
3. Cookie format may be wrong → verify JSON structure

**"Can't find cookie file"**
1. Check filename matches pattern: <sitename>-cookies.json
2. Verify directory: /workspace/group/credentials/cookies/
3. List all files to confirm

**"Session state not persisting"**
1. Ensure saving after each task: agent-browser state save
2. Check file was created: ls credentials/sessions/
3. Try loading explicitly next time

---

## User Guide Reference

For detailed user instructions, see:
- `/workspace/group/CREDENTIALS-GUIDE.md` - Complete user documentation
- `/workspace/group/credentials/README.md` - Technical reference
