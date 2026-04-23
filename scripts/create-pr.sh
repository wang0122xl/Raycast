#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title create-pr
# @raycast.mode silent
# @raycast.argument1 { "type": "text", "placeholder": "directory path" }
# @raycast.argument2 { "type": "text", "placeholder": "target branch (e.g. dev, main)" }

# Optional parameters:
# @raycast.icon images/git.png
# @raycast.packageName create-pr
# @raycast.needsConfirmation false

# Documentation:
# @raycast.description 调用claude，对指定目录的指定分支使用/create-pr的skill
# @raycast.author wang0122xl
# @raycast.authorURL https://raycast.com/wang0122xl

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HISTORY_FILE="$SCRIPT_DIR/.claude-git-push-history"
DIR_PATH="$1"
TARGET_BRANCH="$2"

if [ -z "$DIR_PATH" ] || [ -z "$TARGET_BRANCH" ]; then
  exit 1
fi

# Use zoxide to resolve the path
if command -v zoxide &> /dev/null; then
  RESOLVED_PATH=$(zoxide query "$DIR_PATH" 2>/dev/null)
  if [ $? -ne 0 ] || [ -z "$RESOLVED_PATH" ]; then
    RESOLVED_PATH="$DIR_PATH"
  fi
else
  RESOLVED_PATH="$DIR_PATH"
fi

if [ ! -d "$RESOLVED_PATH" ]; then
  exit 1
fi

# Save to history (deduplicate, keep last 20)
touch "$HISTORY_FILE"
grep -v "^${DIR_PATH}$" "$HISTORY_FILE" > "${HISTORY_FILE}.tmp" 2>/dev/null || true
echo "$DIR_PATH" >> "${HISTORY_FILE}.tmp"
tail -20 "${HISTORY_FILE}.tmp" > "$HISTORY_FILE"
rm -f "${HISTORY_FILE}.tmp"

# Run fully detached from Raycast
nohup bash -c "
  cd \"$RESOLVED_PATH\" || exit 1
  CURRENT_BRANCH=\$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
  REPO_NAME=\$(basename \"$RESOLVED_PATH\")

  OUTPUT=\$(\$HOME/.local/bin/claude -p \"/create-pr $TARGET_BRANCH\" --dangerously-skip-permissions --verbose 2>&1)
  EXIT_CODE=\$?

  if [ \$EXIT_CODE -eq 0 ]; then
    PR_URL=\$(echo \"\$OUTPUT\" | grep -oE 'https://github\\.com/[^/]+/[^/]+/pull/[0-9]+' | head -1)

    if [ -n \"\$PR_URL\" ]; then
      terminal-notifier -title \"\$CURRENT_BRANCH → $TARGET_BRANCH\" -subtitle \"\$REPO_NAME\" -message \"create-pr 完成 ✅ 点击打开\" -open \"\$PR_URL\" -sound Glass
    else
      terminal-notifier -title \"\$CURRENT_BRANCH → $TARGET_BRANCH\" -subtitle \"\$REPO_NAME\" -message \"create-pr 完成 ✅\" -sound Glass
    fi
  else
    terminal-notifier -title \"\$CURRENT_BRANCH → $TARGET_BRANCH\" -subtitle \"\$REPO_NAME\" -message \"create-pr 失败 ❌\" -sound Basso
  fi
" > /dev/null 2>&1 &
