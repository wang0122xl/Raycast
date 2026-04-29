# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Raycast extension for git automation powered by Claude Code CLI. Users select a repo, pick a command (git-push, create-pr, review-pr), and the extension spawns a detached Claude process that executes the operation and streams formatted output back to the Raycast UI.

## Build & Development

```bash
cd claude-git-tools && npm install

npm run build       # ray build
npm run dev         # ray develop (watch mode — run manually in terminal)
npm run lint        # ray lint
npm run fix-lint    # ray lint --fix
```

No test framework is configured. All source is in `claude-git-tools/src/`.

## Architecture

### Execution Flow

1. User picks a repo via `RepoPicker` (shared by git-push, create-pr, review-pr)
2. `SkillGate` checks if a `.md` skill file is configured for the command; prompts for selection if not
3. `buildClaudeCommand()` in `task-manager.ts` constructs the CLI invocation:
   - With skill file: passes `--append-system-prompt-file <skillFile>` and injects prompt via `$ARGUMENTS=<value>`
   - Without skill file: falls back to slash commands (`/git-push-changes`, `/create-pr <branch>`, `/pr-review <url>`)
   - Always includes: `--dangerously-skip-permissions --verbose --model <model> --output-format stream-json --include-partial-messages --include-hook-events`
4. `runTask()` spawns a detached bash process (`spawn()` with `detached: true`, `child.unref()`)
5. Agent JSON stdout is piped through an embedded Node.js formatter script (`outputFormatterScript`) that converts stream-json events into human-readable markdown
6. Output is written to `/tmp/claude-git-tools-tasks/{id}.log`, read on-demand by `TaskDetail`

### Key Files

- `task-manager.ts` — Core engine: process spawning, command construction, embedded output formatter, process lifecycle (stale reaping at 10min, SIGTERM→SIGKILL cleanup)
- `storage.ts` — Raycast `LocalStorage` wrapper for tasks, folders, branch history, model selection, skill paths
- `git-utils.ts` — Repo discovery (3-level deep `.git` scan), remote URL resolution with 60s cache, `gh` CLI wrapper
- `task-detail.tsx` — Real-time output display with URL extraction (GitHub PR URLs, commit URLs, SSH→HTTPS conversion) and `terminal-notifier` integration
- `repo-picker.tsx` — Reusable repo selector with recent history (top 20)
- `skill-picker.tsx` — `SkillGate` component that gates commands behind skill file selection

### Per-Task File Convention

Each task creates three files in `/tmp/claude-git-tools-tasks/`:
- `{id}.log` — streamed output
- `{id}.pid` — process ID for signal handling
- `{id}.exit` — exit code written on completion

### Output Formatter

The formatter is a template literal in `task-manager.ts`, written to `/tmp/claude-git-tools-tasks/format-agent-output.js` at runtime. It handles three agent JSON formats (Claude stream-json, Codex item events, OpenCode step events), deduplicates tool blocks via Set-based keys, and collapses noisy output.

### Auto-Refresh Intervals

- Task list: 3s (running), 30s (finished)
- Task detail: 1s while running

## Raycast Commands (6 total)

| Command | Entry Point | Description |
|---------|------------|-------------|
| git-push | `git-push.tsx` | Push via Claude agent |
| create-pr | `create-pr.tsx` | Create PR with branch picker |
| review-pr | `review-pr.tsx` | Review/merge PRs via Claude |
| view-tasks | `view-tasks.tsx` | Monitor running/completed tasks |
| manage-folders | `manage-folders.tsx` | Configure scan folders and skills |
| manage-model | `manage-model.tsx` | Select Claude model (haiku/sonnet/opus) |

## Patterns to Follow

- Immutable task updates: `updateTask()` merges partials via spread, never mutates in place
- All state flows through `storage.ts` — no direct LocalStorage calls from UI components
- Process cleanup uses recursive child-process kill with bash trap handlers for SIGTERM/INT
- URL extraction in `task-detail.tsx` replaces parsed URL bases with the actual git remote base via `getGitRemoteBaseUrl()`

## Dependencies

- Requires `claude` CLI in PATH with support for `--output-format stream-json`
- Optional: `gh` CLI (for PR operations), `terminal-notifier` (for macOS notifications)
