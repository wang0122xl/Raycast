# Claude Git Tools for Raycast

This repository contains a Raycast extension in `claude-git-tools/` for running `git push` and `create-pr` workflows through the local Claude Code CLI.

## Requirements

- macOS with Raycast installed.
- Node.js and npm for local development/builds.
- `git` available in `PATH`.
- `claude` available in `PATH`.

## Local Claude Code Environment

This extension depends on an existing local Claude Code CLI setup. It does not bundle Claude Code or provision its workflows for you.

Your local environment must already support these Claude slash commands:

- `/git-push-changes`
- `/create-pr <target-branch>`

If `claude` is missing, or the slash commands above are not available in your local Claude Code environment, the Raycast commands will not start successfully.

## Optional Dependencies

- `gh` is recommended for smoother pull request creation if your local `/create-pr` workflow uses GitHub CLI.
- `terminal-notifier` is optional. The extension will still run without it, but macOS task-completion notifications may be unavailable.

## Development

```bash
cd claude-git-tools
npm install
npm run build
```

For local development:

```bash
cd claude-git-tools
npm run dev
```
