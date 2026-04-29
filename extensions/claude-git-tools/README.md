# Claude Git Tools

A Raycast extension that turns everyday git operations into one-click workflows powered by Claude Code CLI. Pick a repo, choose a command, and let Claude handle staging, committing, pushing, creating PRs, and reviewing code — all without leaving Raycast.

## Requirements

| Dependency | Required | Description |
|-----------|----------|-------------|
| [Raycast](https://raycast.com) | Yes | macOS launcher, hosts the extension |
| [Node.js](https://nodejs.org) + npm | Yes | Build and run the extension |
| `git` | Yes | Version control operations |
| [`claude`](https://docs.anthropic.com/en/docs/claude-code) | Yes | Claude Code CLI, must support `--output-format stream-json` |
| [`gh`](https://cli.github.com) | Recommended | GitHub CLI — required for Create PR and Review PR commands |
| [`terminal-notifier`](https://github.com/julienXX/terminal-notifier) | Optional | macOS notifications when tasks complete |

All CLI tools must be available in PATH.

## Getting Started

### 1. Install the Extension

```bash
cd extensions/claude-git-tools
npm install
npm run dev    # opens Raycast dev environment
```

### 2. Configure Scan Folders

Open Raycast and run **Manage Folders & Skills**:

- Press Enter on "Add Folder" to select a parent directory containing your git repos (e.g. `~/git`)
- The extension scans up to 3 levels deep for `.git` directories
- Add multiple folders if your repos are spread across different locations

### 3. Configure Skill Files (Optional)

In the same **Manage Folders & Skills** panel, the "Skills" section lists each command (Git Push, Create PR, Review PR). You can bind a `.md` skill file to each command as a system prompt, giving fine-grained control over Claude's behavior.

If no skill file is configured, the extension falls back to built-in slash commands (`/git-push-changes`, `/create-pr`, `/pr-review`).

### 4. Run a Command

| Command | Flow |
|---------|------|
| **Git Push** | Select repo → Claude stages, commits, and pushes → Task detail panel |
| **Create PR** | Select repo → Select/type target branch → Claude creates PR → Task detail panel |
| **Review PR** | Select repo → PR list (open + closed) → Select PR to review → Task detail panel |

Each command launches a background Claude process. The **Task detail panel** streams real-time output as formatted markdown. Tasks survive Raycast window closure.

### 5. Monitor Tasks

Run **View Tasks** to see all running and completed tasks. Click any task to view its output, extracted PR/commit URLs, and status.

### 6. Select Model

Run **Manage Model** to switch between Claude models (Haiku / Sonnet / Opus).

## Claude CLI Permissions

The extension invokes `claude` with `--allowedTools` to pre-approve only the tools needed for git operations, avoiding interactive permission prompts in the background process.

### Allowed Tools

| Tool | Reason |
|------|--------|
| `Bash(git:*)` | All git operations — add, commit, push, diff, log, branch, merge, rebase, etc. |
| `Bash(gh:*)` | GitHub CLI — create PRs (`gh pr create`), list/review/merge/close PRs |
| `Bash(ls:*)` | List directory contents to explore repo structure |
| `Bash(cat:*)` | Read file contents for diff context and commit message generation |
| `Bash(find:*)` | Discover files and directories within the repo |
| `Bash(grep:*)` | Search file contents for patterns during code review |
| `Bash(mkdir:*)` | Create directories when needed by git operations |
| `Bash(cp:*)` | Copy files during branch or merge operations |
| `Bash(wc:*)` | Count lines/words for change summary statistics |
| `Read` | Claude's built-in file reading tool |
| `Write` | Claude's built-in file writing tool |
| `Edit` | Claude's built-in file editing tool |
| `Grep` | Claude's built-in content search tool |
| `Glob` | Claude's built-in file pattern matching tool |

## Skill File Format

When using custom skill files (`.md`) instead of built-in slash commands, the extension passes user input via `$ARGUMENTS=<value>` in the prompt. Skills must handle this input and produce specific output for the extension to work correctly.

### Argument Format

| Command | `$ARGUMENTS` value | Description |
|---------|-------------------|-------------|
| **git-push** | _(none)_ | No arguments. Prompt is a fixed instruction. |
| **create-pr** | `<branch>` | Target branch entered by the user. Supports two formats: single branch (`main`) or space-separated source and target (`dev main`). The skill should parse this as `{branchFrom} {branchTo}` when two values are present, or treat a single value as the target branch. |
| **review-pr** | `<pr-url>` | Full GitHub PR URL (e.g. `https://github.com/owner/repo/pull/123`). |

The branch input in Create PR comes from the branch picker UI, where users can type a new branch or select from history. The raw text is passed directly as `$ARGUMENTS`.

### Required Output: Git URLs

The extension extracts URLs from Claude's output to enable clickable notifications (via `terminal-notifier`) and in-app link actions. If the skill does not output the expected URL, the notification will still fire but without a clickable link.

| Command | Expected URL in output | Example |
|---------|----------------------|---------|
| **git-push** | Commit URL | `https://github.com/owner/repo/commit/abc1234` |
| **create-pr** | Pull request URL | `https://github.com/owner/repo/pull/42` |
| **review-pr** | Pull request URL | `https://github.com/owner/repo/pull/42` |

Supported hosting platforms: GitHub, GitLab, Bitbucket. SSH remote URLs (`git@github.com:...`) are automatically converted to HTTPS.

### Example: create-pr skill

```markdown
Create a pull request.

Parse `$ARGUMENTS` as branch input:
- If two values separated by space (e.g. `dev main`): first is source branch, second is target branch
- If single value (e.g. `main`): use current branch as source, the value as target branch

Steps:
1. Stage and commit any uncommitted changes
2. Push the source branch to remote
3. Create a PR from source to target using `gh pr create`
4. Output the PR URL (e.g. https://github.com/owner/repo/pull/123)
```

## Commands

| Command | Description |
|---------|-------------|
| **Git Push** | Stage, commit, and push changes via Claude |
| **Create PR** | Create a pull request with AI-generated description and branch picker |
| **Review PR** | Review open PRs with Claude, then merge/close from Raycast |
| **View Tasks** | Monitor running and completed tasks with real-time output |
| **Manage Folders & Skills** | Configure repo scan folders and attach skill files per command |
| **Manage Model** | Switch between Claude models (Haiku / Sonnet / Opus) |

## Development

```bash
npm install
npm run build       # ray build
npm run dev         # ray develop (watch mode)
npm run lint        # ray lint
npm run fix-lint    # ray lint --fix
```

## License

MIT
