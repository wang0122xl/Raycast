# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Raycast extension that provides git automation powered by AI code agents (Claude, Codex, OpenCode). The extension allows users to:
- Execute git push operations via AI agents
- Create pull requests with AI-generated descriptions
- Manage multiple code agents and scan folders for git repositories
- View and monitor running/completed tasks with real-time output

## Build & Development

```bash
# Install dependencies
cd claude-git-tools && npm install

# Build the extension
npm run build

# Development mode (watch for changes)
npm run dev

# Lint
npm run lint

# Fix linting issues
npm run fix-lint
```

## Architecture

### Task Execution System

The core architecture revolves around **background task execution** with **agent output formatting**:

1. **Task Manager** (`task-manager.ts`):
   - Spawns detached shell processes that run AI agents (claude/codex/opencode)
   - Each task writes to a temp file in `/tmp/claude-git-tools-tasks/`
   - Tracks PID, exit code, and output for each task
   - Uses a **unified output formatter** (`outputFormatterScript`) that pipes agent JSON output through a Node.js script to filter and format events

2. **Output Formatter** (embedded in `task-manager.ts`):
   - Handles three different JSON formats:
     - **Claude**: `stream-json` format with `content_block`, `delta`, `tool_use`, `tool_result` events
     - **Codex**: `item.started`, `item.completed` events with nested `item` payload
     - **OpenCode**: `step_start`, `step_finish`, `tool_use`, `text` events with nested `part` payload
   - Filters out metadata events (step_start, step_finish, turn.started, etc.)
   - Extracts tool commands, outputs, and assistant text
   - Deduplicates repeated blocks to reduce noise

3. **Storage** (`storage.ts`):
   - Uses Raycast's `LocalStorage` API for persistence
   - Stores: tasks, folder configurations, directory history, branch history, selected code agent
   - Task schema includes: id, command, dir, label, branch, status, outputFile, pidFile, exitCodeFile, startTime

4. **Git Repository Discovery** (`git-utils.ts`):
   - Scans configured folders up to 3 levels deep for `.git` directories
   - Builds a flat list of repositories with display names

### UI Components

- **RepoPicker**: Reusable component for selecting git repositories (used by git-push and create-pr)
- **TaskDetail**: Shows real-time task output with markdown rendering (uses `diff` code blocks for terminal-like appearance)
- **ViewTasks**: Lists running and finished tasks with auto-refresh (3s for running, 30s for finished)
- **ManageFolders**: Configure code agent selection and folder scanning

### Git URL Extraction

The `extractGitUrl()` function in `task-detail.tsx` parses agent output to find:
- **create-pr**: GitHub PR URLs (`https://github.com/.../pull/123`)
- **git-push**: Git host URLs (GitHub/GitLab/Bitbucket) or any HTTPS URL

## Agent Command Construction

Each agent has a specific command format in `buildAgentCmd()`:

- **Claude**: `claude -p "<prompt>" --dangerously-skip-permissions --verbose --output-format stream-json --include-partial-messages`
- **Codex**: `codex exec --full-auto --json "<prompt>"`
- **OpenCode**: `opencode run --format json "<prompt>"`

## Key Patterns

1. **Detached Process Execution**: Tasks run in detached bash processes with `nohup` and `&` to survive Raycast window closure
2. **Terminal Notifications**: Uses `terminal-notifier` to alert users when tasks complete (with git URLs when available)
3. **Auto-refresh**: Task list and detail views poll for status updates at different intervals based on task state
4. **Immutable Task Updates**: Tasks are updated via `updateTask()` which merges partial updates into the stored task list

## File Structure

```
claude-git-tools/
├── src/
│   ├── git-push.tsx          # Git push command entry
│   ├── create-pr.tsx         # Create PR command entry (with branch picker)
│   ├── manage-folders.tsx    # Agent & folder configuration
│   ├── view-tasks.tsx        # Task list view
│   ├── task-detail.tsx       # Task detail view with output
│   ├── task-manager.ts       # Core task execution & output formatting
│   ├── storage.ts            # LocalStorage persistence layer
│   ├── git-utils.ts          # Git repository scanning
│   └── repo-picker.tsx       # Reusable repo selection component
├── package.json              # Extension manifest with 4 commands
└── tsconfig.json             # TypeScript config (ES2022, node16 modules)
```

## Important Notes

- The output formatter script is embedded as a template literal in `task-manager.ts` and written to `/tmp/claude-git-tools-tasks/format-agent-output.js` on first use
- Task output files persist in `/tmp/` and are read on-demand (not stored in LocalStorage)
- The extension requires `claude`, `codex`, or `opencode` CLI tools to be installed and in PATH
- Git operations are executed in the selected repository's directory context
