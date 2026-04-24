# Claude Git Tools Agent Workflows Design

**Date:** 2026-04-24

## Goal

Rework the `git-push` and `create-pr` commands in `claude-git-tools` so they no longer depend on plain final-text prompts for Claude. The extension should launch each agent through the most explicit workflow entry point available, consume structured streaming output, and show process-oriented logs in Raycast while preserving task notifications and Git URL extraction.

## Current Problems

- Claude is still invoked with a natural-language prompt that tells it to read a skill file, which weakens skill selection and is biased toward final text instead of process events.
- `claude -p` is already using `stream-json`, but the formatter still treats Claude output like generic message blobs and can duplicate or flatten partial messages.
- OpenCode and Codex are treated as free-form prompt runners instead of workflow runners with a stable internal contract.
- The task launcher API exposes raw prompt strings, which leaks implementation details into UI commands.

## Design

### 1. Internal workflow IDs

`git-push` and `create-pr` become first-class workflow IDs inside `task-manager.ts`.

- UI commands call `launchTask(agent, command, dir, label, options)`
- `task-manager.ts` owns the agent-specific execution details
- Target branch remains an explicit option for `create-pr`

This keeps the UI layer simple and prevents prompt drift between commands.

### 2. Agent-specific explicit execution

The extension will use the most explicit supported workflow entry per agent.

#### Claude

Use slash commands directly:

- `claude -p ... -- "/git-push-changes"`
- `claude -p ... -- "/create-pr <target>"`

Flags:

- `--dangerously-skip-permissions`
- `--verbose`
- `--output-format stream-json`
- `--include-partial-messages`
- `--include-hook-events`

No extra natural-language wrapper prompt is added for Claude.

#### OpenCode

Use explicit custom commands via `opencode run --command`.

At runtime, the extension writes a temporary OpenCode config directory under the task temp root containing:

- `commands/git-push.md`
- `commands/create-pr.md`

Those command templates define the workflow contract and allow `$ARGUMENTS` for the PR target branch. The launcher sets `OPENCODE_CONFIG_DIR` for the child process and executes:

- `opencode run --format json --command git-push`
- `opencode run --format json --command create-pr <target>`

This keeps OpenCode on a command-based workflow entry instead of a plain free-form message.

#### Codex

Codex does not get a slash-command equivalent in `codex exec`, so the extension uses fixed workflow templates rather than arbitrary prompts.

- `codex exec --full-auto --json "<git-push workflow prompt>"`
- `codex exec --full-auto --json "<create-pr workflow prompt>"`

These prompts are generated internally from workflow IDs and options, not passed through the UI.

### 3. Structured event normalization

The embedded formatter script remains the single output normalization layer, but it becomes mode-aware.

#### Claude handling

- Prefer `stream_event.content_block_delta.delta.text` for incremental text
- Prefer `content_block_start` tool-use events for command logging
- Ignore final assistant text blocks when they would duplicate already-streamed deltas
- Keep assistant tool-use/tool-result blocks as fallback if they were not already emitted
- Accept hook events in the stream, but only surface them when they include meaningful command or output text

This removes the current “whole-message dedupe” approach that causes repeated partial text.

#### Codex handling

Keep structured `item.started` / `item.completed` parsing, emitting:

- command start lines
- aggregated command output
- final agent messages

#### OpenCode handling

Keep structured JSON event parsing, emitting:

- command or tool headers
- tool output
- text events

### 4. UI and task behavior

The existing task UI remains intact but benefits from cleaner process logs.

- `TaskDetail` continues to show running status, latest output, and full output
- `ViewTasks` continues to show finished tasks and open Git links
- URL extraction remains output-based, so no agent-specific response schema is required

### 5. Compatibility and scope

In scope:

- `claude-git-tools` extension logic for `git-push` and `create-pr`
- task launch API cleanup
- runtime OpenCode command config generation
- stream formatter improvements

Out of scope:

- redesigning other commands
- changing repository discovery
- changing Raycast storage format beyond task metadata already introduced
- reworking the standalone `scripts/*.sh` helpers unless needed later for consistency

## Validation

- `npm run build` in `claude-git-tools`
- sanity-check generated commands for Claude, Codex, and OpenCode
- verify formatter behavior with representative JSON event samples
- verify running/completed/failed task rendering still works
