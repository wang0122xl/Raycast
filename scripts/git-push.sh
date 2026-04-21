#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title git push
# @raycast.mode fullOutput
# @raycast.argument1 { "type": "text", "placeholder": "directory path" }

# Optional parameters:
# @raycast.icon 🤖

# Documentation:
# @raycast.description 使用claude对指定目录执行/git-push-changes skill
# @raycast.author wang0122xl
# @raycast.authorURL https://raycast.com/wang0122xl

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HISTORY_FILE="$SCRIPT_DIR/.claude-git-push-history"
DIR_PATH="$1"

if [ -z "$DIR_PATH" ]; then
  echo "Error: Directory path is required."
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

# Verify directory exists
if [ ! -d "$RESOLVED_PATH" ]; then
  echo "Error: Directory not found: $RESOLVED_PATH"
  exit 1
fi

# Save to history (deduplicate, keep last 20)
touch "$HISTORY_FILE"
grep -v "^${DIR_PATH}$" "$HISTORY_FILE" > "${HISTORY_FILE}.tmp" 2>/dev/null || true
echo "$DIR_PATH" >> "${HISTORY_FILE}.tmp"
tail -20 "${HISTORY_FILE}.tmp" > "$HISTORY_FILE"
rm -f "${HISTORY_FILE}.tmp"

# Change to directory and run claude with git-push-changes skill
cd "$RESOLVED_PATH" || exit 1

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

echo "Working in: $(pwd)"
echo "Branch: $CURRENT_BRANCH"
echo "Running claude /git-push-changes ..."
echo "---"

/Users/jason/.local/bin/claude -p "/git-push-changes" --dangerously-skip-permissions --verbose

if [ $? -eq 0 ]; then
  osascript -e "display notification \"git push 完成 ✅\" with title \"$CURRENT_BRANCH\" subtitle \"$(basename "$RESOLVED_PATH")\""
else
  osascript -e "display notification \"git push 失败 ❌\" with title \"$CURRENT_BRANCH\" subtitle \"$(basename "$RESOLVED_PATH")\""
fi
