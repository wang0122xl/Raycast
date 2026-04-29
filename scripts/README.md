# Scripts

Raycast Script Commands for quick git operations powered by Claude Code CLI. These are lightweight shell scripts that run as [Raycast Script Commands](https://github.com/raycast/script-commands) — no extension build required.

## Scripts

### git-push.sh

One-click git push. Stages, commits, and pushes all changes in the target repo using Claude's `/git-push-changes` skill.

| Parameter | Type | Description |
|-----------|------|-------------|
| `directory path` | text | Path to the git repo (supports [zoxide](https://github.com/ajeetdsouza/zoxide) fuzzy resolution) |

Behavior:
- Resolves the directory path via zoxide (falls back to literal path)
- Spawns a fully detached Claude process so Raycast returns immediately
- Sends a macOS notification on success or failure via `terminal-notifier`
- Maintains a history file (`.claude-git-push-history`, last 20 entries)

### create-pr.sh

One-click PR creation. Creates a pull request from the current branch to a specified target branch using Claude's `/create-pr` skill.

| Parameter | Type | Description |
|-----------|------|-------------|
| `directory path` | text | Path to the git repo (supports zoxide) |
| `target branch` | text | Branch to merge into (e.g. `dev`, `main`) |

Behavior:
- Same path resolution and detached execution as `git-push.sh`
- Extracts the GitHub PR URL from Claude's output
- Notification includes a clickable link to the newly created PR
- Shares the same history file with `git-push.sh`

## Requirements

- `claude` CLI in PATH (`~/.local/bin/claude`)
- `git` in PATH
- `terminal-notifier` for macOS notifications
- Optional: `zoxide` for fuzzy directory resolution
- Optional: `gh` CLI (used by Claude internally for PR creation)
