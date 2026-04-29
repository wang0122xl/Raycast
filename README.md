# Claude Git Tools for Raycast

[中文版](README.zh-CN.md)

A Raycast extension that turns everyday git operations into one-click workflows powered by Claude Code. Pick a repo, choose a command, and let Claude handle the rest — committing, pushing, creating PRs, and reviewing code — all without leaving Raycast.

## Documentation

| Directory | EN | 中文 |
|-----------|----|----|
| `extensions/claude-git-tools/` | [README](extensions/claude-git-tools/README.md) | [中文](extensions/claude-git-tools/README.zh-CN.md) |
| `scripts/` | [README](scripts/README.md) | [中文](scripts/README.zh-CN.md) |

## Why

Switching between terminal, browser, and IDE just to push code or open a PR breaks flow. This extension keeps you in Raycast: select a repo, fire a command, and Claude takes care of staging, committing, writing PR descriptions, and even reviewing diffs. You stay focused; the grunt work happens in the background.

## Commands

| Command | What it does |
|---------|-------------|
| Git Push | Stage, commit, and push changes via Claude |
| Create PR | Create a pull request with an AI-generated description and branch picker |
| Review PR | Review open PRs with Claude, then merge/close from Raycast |
| View Tasks | Monitor running and completed tasks with real-time output |
| Manage Folders & Skills | Configure which folders to scan for repos and attach skill files |
| Manage Model | Switch between Claude models (Haiku / Sonnet / Opus) |

## Requirements

- macOS with [Raycast](https://raycast.com) installed
- Node.js and npm
- `git` in PATH
- `claude` CLI in PATH (with `--output-format stream-json` support)

### Optional

- [`gh`](https://cli.github.com) — enables PR creation and review features
- [`terminal-notifier`](https://github.com/julienXX/terminal-notifier) — macOS notifications when tasks complete

## Getting Started

```bash
# Clone and build
git clone https://github.com/wang0122xl/claude-git-tools-raycast.git
cd claude-git-tools-raycast/claude-git-tools
npm install
npm run build
```

Then open Raycast and search for any of the commands above.

### Development

```bash
cd claude-git-tools
npm run dev       # Watch mode (opens Raycast dev environment)
npm run lint      # Check for lint issues
npm run fix-lint  # Auto-fix lint issues
```

## How It Works

1. You pick a git repository from your configured scan folders
2. The extension spawns a detached Claude process in the background
3. Claude's streaming JSON output is piped through a formatter into human-readable markdown
4. Task progress is displayed in real-time inside Raycast
5. When done, you get a macOS notification with a link to the PR or commit

Tasks survive Raycast window closure — they run as independent background processes.

### Skill Files

Each command can optionally use a `.md` skill file as a system prompt, giving you fine-grained control over how Claude behaves for that specific operation. Configure skill files via the "Manage Folders & Skills" command.

## License

MIT
