#!/usr/bin/env bash
# upstream-sync.sh — manage cherry-picks from nanoclaw upstream
set -euo pipefail

REMOTE="nanoclaw"
REMOTE_BRANCH="nanoclaw/main"
SYNC_FILE="scripts/.last-upstream-sync"
LOG_FILE="scripts/.upstream-sync-log"

# Files BizClaw has modified — cherry-picks touching these need review
CONFLICT_RISK_FILES=(
  "src/container-runner.ts"
  "src/index.ts"
  "src/task-scheduler.ts"
  "src/db.ts"
  "src/config.ts"
  "src/types.ts"
  "container/agent-runner/src/ipc-mcp-stdio.ts"
  "container/agent-runner/src/index.ts"
  "container/Dockerfile"
  "container/build.sh"
  "package.json"
)

# Paths safe to pull directly
SAFE_PATHS=(
  ".claude/skills/"
  "docs/"
  "config-examples/"
  "CHANGELOG.md"
)

get_baseline() {
  if [[ -f "$SYNC_FILE" ]]; then
    cat "$SYNC_FILE"
  else
    git merge-base HEAD "$REMOTE_BRANCH" 2>/dev/null || echo ""
  fi
}

cmd_check() {
  echo "==> Fetching $REMOTE/main..."
  git fetch "$REMOTE" main 2>&1

  BASELINE=$(get_baseline)
  if [[ -z "$BASELINE" ]]; then
    echo "ERROR: No baseline found. Run: bash scripts/upstream-sync.sh mark-synced"
    exit 1
  fi

  TOTAL=$(git log --oneline "$BASELINE...$REMOTE_BRANCH" 2>/dev/null | wc -l | tr -d ' ')
  echo ""
  echo "==> $TOTAL new commits since last sync ($BASELINE)"
  echo ""

  if [[ "$TOTAL" -eq 0 ]]; then
    echo "Already up to date."
    return
  fi

  echo "--- Commits (newest first) ---"
  git log --oneline "$BASELINE...$REMOTE_BRANCH"
  echo ""

  echo "--- Conflict-risk files touched by new commits ---"
  ANY_RISK=0
  for f in "${CONFLICT_RISK_FILES[@]}"; do
    COMMITS=$(git log --oneline "$BASELINE...$REMOTE_BRANCH" -- "$f" 2>/dev/null)
    if [[ -n "$COMMITS" ]]; then
      echo "  RISK: $f"
      echo "$COMMITS" | sed 's/^/    /'
      ANY_RISK=1
    fi
  done
  if [[ "$ANY_RISK" -eq 0 ]]; then
    echo "  (none)"
  fi
  echo ""

  echo "--- Safe-to-pull paths with changes ---"
  ANY_SAFE=0
  for p in "${SAFE_PATHS[@]}"; do
    COMMITS=$(git log --oneline "$BASELINE...$REMOTE_BRANCH" -- "$p" 2>/dev/null)
    if [[ -n "$COMMITS" ]]; then
      echo "  SAFE: $p"
      echo "$COMMITS" | sed 's/^/    /'
      ANY_SAFE=1
    fi
  done
  if [[ "$ANY_SAFE" -eq 0 ]]; then
    echo "  (none)"
  fi
}

cmd_categorize() {
  BASELINE=$(get_baseline)
  if [[ -z "$BASELINE" ]]; then
    echo "ERROR: No baseline. Run mark-synced first."
    exit 1
  fi

  echo "==> Fetching $REMOTE/main..."
  git fetch "$REMOTE" main 2>&1

  echo ""
  echo "=== ALWAYS PULL (security/fix/CVE/patch) ==="
  git log --oneline "$BASELINE...$REMOTE_BRANCH" | grep -iE "security|fix|cve|patch|vuln" || echo "  (none)"

  echo ""
  echo "=== EVALUATE (touches src/) ==="
  git log --oneline "$BASELINE...$REMOTE_BRANCH" | while read -r hash msg; do
    if git diff-tree --no-commit-id -r --name-only "$hash" 2>/dev/null | grep -q "^src/"; then
      echo "  $hash $msg"
    fi
  done || echo "  (none)"

  echo ""
  echo "=== SAFE (skills/docs only) ==="
  git log --oneline "$BASELINE...$REMOTE_BRANCH" | while read -r hash msg; do
    FILES=$(git diff-tree --no-commit-id -r --name-only "$hash" 2>/dev/null)
    if echo "$FILES" | grep -qE "^\.(claude/skills|docs|config-examples|CHANGELOG)"; then
      if ! echo "$FILES" | grep -qE "^src/"; then
        echo "  $hash $msg"
      fi
    fi
  done || echo "  (none)"

  echo ""
  echo "=== NEW FILES (added, not modified) ==="
  git log --oneline "$BASELINE...$REMOTE_BRANCH" | while read -r hash msg; do
    NEW=$(git diff-tree --no-commit-id -r --diff-filter=A --name-only "$hash" 2>/dev/null)
    if [[ -n "$NEW" ]]; then
      echo "  $hash $msg"
      echo "$NEW" | sed 's/^/    + /'
    fi
  done || echo "  (none)"
}

cmd_pick() {
  HASH="${1:-}"
  if [[ -z "$HASH" ]]; then
    echo "Usage: $0 pick <hash>"
    exit 1
  fi

  echo "=== Commit info ==="
  git show --stat "$HASH" | head -40

  echo ""
  echo "=== Conflict-risk files in this commit ==="
  CHANGED=$(git diff-tree --no-commit-id -r --name-only "$HASH" 2>/dev/null)
  ANY_RISK=0
  for f in "${CONFLICT_RISK_FILES[@]}"; do
    if echo "$CHANGED" | grep -q "^${f}$"; then
      echo "  RISK: $f"
      ANY_RISK=1
    fi
  done
  if [[ "$ANY_RISK" -eq 0 ]]; then
    echo "  (no conflict-risk files)"
  fi

  echo ""
  read -r -p "Cherry-pick $HASH with --no-commit? [y/N] " CONFIRM
  if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "Aborted."
    exit 0
  fi

  git cherry-pick "$HASH" --no-commit
  echo ""
  echo "Cherry-pick staged (not committed). Review with: git diff --cached"

  # Log it
  TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  SUBJECT=$(git log -1 --format="%s" "$HASH")
  echo "[$TIMESTAMP] cherry-pick $HASH: $SUBJECT" >> "$LOG_FILE"
  echo "Logged to $LOG_FILE"
}

cmd_skills() {
  echo "==> Fetching $REMOTE/main..."
  git fetch "$REMOTE" main 2>&1

  echo ""
  echo "==> Checking out .claude/skills/ from $REMOTE_BRANCH..."
  BEFORE=$(git ls-files .claude/skills/ | sort)
  git checkout "$REMOTE_BRANCH" -- .claude/skills/ 2>/dev/null || {
    echo "No .claude/skills/ directory on upstream. Nothing to pull."
    return
  }
  AFTER=$(git ls-files .claude/skills/ | sort)

  echo ""
  echo "=== Changes ==="
  diff <(echo "$BEFORE") <(echo "$AFTER") || true
  git status .claude/skills/

  echo ""
  read -r -p "Commit these skill changes? [y/N] " CONFIRM
  if [[ "$CONFIRM" == "y" || "$CONFIRM" == "Y" ]]; then
    HASH=$(git rev-parse "$REMOTE_BRANCH")
    git add .claude/skills/
    git commit -m "upstream: pull community skills (nanoclaw ${HASH:0:7})"
    echo "Committed."
  else
    echo "Not committed. Changes are staged."
  fi
}

cmd_log() {
  if [[ -f "$LOG_FILE" ]]; then
    cat "$LOG_FILE"
  else
    echo "(no sync log yet)"
  fi
}

cmd_mark_synced() {
  git fetch "$REMOTE" main 2>&1
  HASH=$(git rev-parse "$REMOTE_BRANCH")
  echo "$HASH" > "$SYNC_FILE"
  echo "Baseline set to $HASH"
  echo "  ($REMOTE_BRANCH as of $(date -u +"%Y-%m-%dT%H:%M:%SZ"))"
}

COMMAND="${1:-help}"
shift || true

case "$COMMAND" in
  check)       cmd_check ;;
  categorize)  cmd_categorize ;;
  pick)        cmd_pick "$@" ;;
  skills)      cmd_skills ;;
  log)         cmd_log ;;
  mark-synced) cmd_mark_synced ;;
  *)
    echo "Usage: $0 {check|categorize|pick <hash>|skills|log|mark-synced}"
    exit 1
    ;;
esac
