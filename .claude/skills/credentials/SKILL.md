---
name: credentials
description: Manage browser sessions and credentials for automating tasks across websites. Save sessions after login, inject cookies from browser exports, and enable persistent browser automation. Use when user wants to automate tasks on sites they're logged into.
allowed-tools: Bash, Read, Write, Edit
---

# Credential Management Skill

Save and reuse browser sessions so Andy can automate tasks on sites you're already logged into.

## How It Works

Two approaches depending on what you have:

| You have | Use |
|----------|-----|
| Nothing yet — want to log in once and save | **Approach A: State save** |
| JSON cookies exported from Cookie-Editor | **Approach B: Cookie injection** |

> **Note:** Netscape format cookies (header says `# Netscape HTTP Cookie File`) are not directly usable. Re-export as JSON from Cookie-Editor, or use Approach A instead.

---

## Approach A: Login Once, Save State (Recommended)

Best when you can log in interactively or the agent can fill the login form.

```bash
# 1. Open the login page
agent-browser open https://godaddy.com/login

# 2. Snapshot to find the login fields
agent-browser snapshot -i

# 3. Fill credentials (or navigate manually if 2FA needed)
agent-browser fill @e1 "your@email.com"
agent-browser fill @e2 "yourpassword"
agent-browser click @e3

# 4. Wait for login to complete
agent-browser wait --url "**/dashboard"

# 5. Save full session state (cookies + localStorage)
agent-browser state save /workspace/group/credentials/sessions/godaddy-session.json
agent-browser close
```

**To reuse later:**
```bash
agent-browser state load /workspace/group/credentials/sessions/godaddy-session.json
agent-browser open https://godaddy.com/dashboard
# Now authenticated — continue with task
```

---

## Approach B: Inject Cookies from JSON Export

Use when you've exported cookies from a browser. Two JSON formats are supported:

**Format 1 — Key-value object** (simpler, from DevTools or manual export):
```json
{ "cookie_name": "cookie_value", "other_name": "other_value" }
```

**Format 2 — Cookie-Editor array** (full metadata):
```json
[{ "name": "cookie_name", "value": "cookie_value", "domain": ".example.com", "path": "/" }]
```

**Step 1: Save the JSON cookie file**

When user pastes JSON cookies, write them to:
```
/workspace/group/credentials/cookies/<sitename>-cookies.json
```

**Step 2: Open the site first, then inject**

```bash
# Must open the site BEFORE injecting (browser needs a page context)
agent-browser open https://godaddy.com
agent-browser wait --load networkidle

# Inject all cookies via JavaScript eval — handles both formats automatically:
COOKIES=$(cat /workspace/group/credentials/cookies/godaddy-cookies.json)

agent-browser eval "
  const raw = $COOKIES;
  const entries = Array.isArray(raw)
    ? raw.map(c => [c.name, c.value])
    : Object.entries(raw);
  let count = 0;
  entries.forEach(([name, value]) => {
    document.cookie = name + '=' + value + '; path=/; domain=.godaddy.com';
    count++;
  });
  count + ' cookies injected';
"

# Reload to apply cookies
agent-browser reload
agent-browser wait --load networkidle

# Check current URL — if redirected to dashboard/account, login worked
agent-browser get url

# Snapshot to verify login state
agent-browser snapshot -i

# Save state so you don't need to re-inject next time
agent-browser state save /workspace/group/credentials/sessions/godaddy-session.json
agent-browser close
```

> **Why open first?** `eval` runs in the browser's JS context, not Node. The page must be loaded for `document.cookie` to work.

> **Limitation:** `httpOnly` cookies cannot be set via `document.cookie` — they're only sent by the server. If login still fails after injection, use Approach A (state save after real login) instead.

---

## Directory Structure

```
/workspace/group/credentials/
├── cookies/          # Raw JSON cookie exports (temporary — use to bootstrap)
│   └── godaddy-cookies.json
└── sessions/         # Saved browser state (preferred for reuse)
    └── godaddy-session.json
```

Sessions are preferred over raw cookies because they include httpOnly cookies and localStorage.

---

## Commands Reference

```bash
# Save/load full browser state (cookies + localStorage + session)
agent-browser state save /workspace/group/credentials/sessions/<site>-session.json
agent-browser state load /workspace/group/credentials/sessions/<site>-session.json

# Individual cookies
agent-browser cookies                      # List current cookies
agent-browser cookies set name value       # Set a single cookie
agent-browser cookies clear                # Clear all cookies

# JavaScript injection
agent-browser eval "document.cookie = 'name=value; path=/'"
```

---

## Common Workflows

### First-time setup for a site
```
User: "Set up GoDaddy credentials"
1. Ask: "Do you have JSON cookies from Cookie-Editor, or should I open the login page?"
2. If JSON: Approach B → inject → state save
3. If login page: Approach A → fill form → state save
4. Confirm: "Saved GoDaddy session. Future tasks will load this automatically."
```

### Automated task with saved session
```
User: "Buy bizclaw.io on GoDaddy"
1. Check: credentials/sessions/godaddy-session.json exists? → YES
2. agent-browser state load credentials/sessions/godaddy-session.json
3. agent-browser open https://godaddy.com/domainsearch/find?checkAvail=1&tld=com&domainToCheck=bizclaw.io
4. Proceed with task
5. agent-browser state save credentials/sessions/godaddy-session.json (update state)
```

### Session expired
```
If login fails after loading state (redirected to login page):
1. Inform user: "GoDaddy session expired."
2. Offer: "Should I log in again?" → Approach A
3. Or: "Paste fresh cookies from Cookie-Editor" → Approach B
4. Save updated state
```

### List saved credentials
```bash
echo "=== Sessions ===" && ls -lh /workspace/group/credentials/sessions/ 2>/dev/null || echo "(none)"
echo "=== Cookie files ===" && ls -lh /workspace/group/credentials/cookies/ 2>/dev/null || echo "(none)"
```

### Delete credentials for a site
```bash
rm -f /workspace/group/credentials/sessions/<site>-session.json
rm -f /workspace/group/credentials/cookies/<site>-cookies.json
echo "Deleted <site> credentials"
```

---

## Cookie Export Format (JSON)

Cookie-Editor → Export → **JSON** (not Netscape):

```json
[
  {
    "domain": ".godaddy.com",
    "name": "auth_idp",
    "value": "abc123...",
    "path": "/",
    "expires": 1777689600,
    "httpOnly": true,
    "secure": true,
    "sameSite": "Lax"
  }
]
```

If user gives Netscape format (`# Netscape HTTP Cookie File` header), tell them:
> "Please re-export as JSON from Cookie-Editor: click the export button and choose JSON format, not Netscape."

---

## Security

- Credentials stored in `/workspace/group/credentials/` — local to this group's container mount
- Never log cookie values or session tokens in responses
- Never send cookies to external services
- Warn before automating on: banking, crypto exchanges, medical records
- Delete on user request — don't retain after task if user asks
