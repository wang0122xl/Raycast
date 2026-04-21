#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title create-pr
# @raycast.mode fullOutput
# @raycast.argument1 { "type": "text", "placeholder": "directory path" }
# @raycast.argument2 { "type": "text", "placeholder": "target branch (e.g. dev, main)" }

# Optional parameters:
# @raycast.icon 🤖
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

if [ -z "$DIR_PATH" ]; then
  echo "Error: Directory path is required."
  exit 1
fi

if [ -z "$TARGET_BRANCH" ]; then
  echo "Error: Target branch is required."
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

# Change to directory
cd "$RESOLVED_PATH" || exit 1

# Get current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
if [ $? -ne 0 ]; then
  echo "Error: Not a git repository: $RESOLVED_PATH"
  exit 1
fi

# Display confirmation info
echo "================================"
echo "  Directory:     $(pwd)"
echo "  Current Branch: $CURRENT_BRANCH"
echo "  Target Branch:  $TARGET_BRANCH"
echo "================================"
echo ""
echo "Running claude /create-pr $TARGET_BRANCH ..."
echo "---"

/Users/jason/.local/bin/claude -p "/create-pr $TARGET_BRANCH" --dangerously-skip-permissions --verbose

if [ $? -eq 0 ]; then
  osascript -e "display notification \"create-pr $TARGET_BRANCH 完成 ✅\" with title \"$CURRENT_BRANCH → $TARGET_BRANCH\" subtitle \"$(basename "$RESOLVED_PATH")\""
else
  osascript -e "display notification \"create-pr $TARGET_BRANCH 失败 ❌\" with title \"$CURRENT_BRANCH → $TARGET_BRANCH\" subtitle \"$(basename "$RESOLVED_PATH")\""
fi
