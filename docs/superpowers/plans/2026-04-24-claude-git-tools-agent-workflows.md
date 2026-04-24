# Claude Git Tools Agent Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace free-form `git-push` / `create-pr` prompting with explicit agent workflows and structured streaming output in `claude-git-tools`.

**Architecture:** Move workflow selection into `task-manager.ts`, generate agent-specific runtime commands from stable workflow IDs, and normalize each agent's structured event stream into Raycast-friendly process logs. Keep the UI contract stable so existing task views and Git-link extraction continue to work.

**Tech Stack:** TypeScript, Raycast API, Node.js child processes, JSONL stream parsing

---

### Task 1: Internalize workflow selection in the task manager

**Files:**
- Modify: `claude-git-tools/src/task-manager.ts`
- Modify: `claude-git-tools/src/git-push.tsx`
- Modify: `claude-git-tools/src/create-pr.tsx`

- [ ] **Step 1: Remove raw prompt construction from the UI commands**

```tsx
const task = await launchTask(agent, "git-push", fullPath, "git push");
const task = await launchTask(agent, "create-pr", dirPath, "create-pr", {
  targetBranch: branch,
});
```

- [ ] **Step 2: Change `launchTask()` to accept workflow options instead of a prompt**

```ts
export async function launchTask(
  agent: CodeAgent,
  command: TaskCommand,
  dir: string,
  label: string,
  options: { targetBranch?: string } = {},
): Promise<Task>
```

- [ ] **Step 3: Add fixed workflow builders per agent**

```ts
function buildAgentRunSpec(
  agent: CodeAgent,
  command: TaskCommand,
  options: { targetBranch?: string },
): AgentRunSpec
```

- [ ] **Step 4: Keep `create-pr` target-branch validation inside the task manager**

```ts
if (command === "create-pr" && !options.targetBranch) {
  throw new Error("Target branch is required for create-pr");
}
```

### Task 2: Add explicit runtime command support for Claude, Codex, and OpenCode

**Files:**
- Modify: `claude-git-tools/src/task-manager.ts`

- [ ] **Step 1: Add Claude slash-command execution**

```ts
return {
  mode: "claude",
  shellCommand:
    'claude -p --dangerously-skip-permissions --verbose --output-format stream-json --include-partial-messages --include-hook-events -- "/git-push-changes"',
};
```

- [ ] **Step 2: Add Codex fixed workflow prompts**

```ts
const prompt = [
  "Execute the git-push workflow in this repository.",
  "Inspect git status first.",
  "Push the current branch to its remote.",
  "Avoid planning or long summaries.",
].join("\n");
```

- [ ] **Step 3: Generate OpenCode command definitions under the temp task directory**

```ts
writeFileSync(join(OPENCODE_COMMANDS_DIR, "git-push.md"), gitPushCommand);
writeFileSync(join(OPENCODE_COMMANDS_DIR, "create-pr.md"), createPrCommand);
```

- [ ] **Step 4: Launch OpenCode with `OPENCODE_CONFIG_DIR` and `--command`**

```ts
OPENCODE_CONFIG_DIR=/tmp/... opencode run --format json --command create-pr main
```

### Task 3: Make the formatter stream-oriented for Claude and keep other agents stable

**Files:**
- Modify: `claude-git-tools/src/task-manager.ts`

- [ ] **Step 1: Pass a formatter mode into the Node formatter process**

```bash
${agentCmd} 2>&1 | AGENT_OUTPUT_MODE=claude node format-agent-output.js
```

- [ ] **Step 2: Parse Claude text from `stream_event` deltas instead of final assistant blobs**

```js
if (event.type === "stream_event" &&
    event.event?.type === "content_block_delta" &&
    event.event?.delta?.type === "text_delta") {
  return event.event.delta.text || "";
}
```

- [ ] **Step 3: Emit Claude tool-use headers from `content_block_start`**

```js
if (streamEvent.type === "content_block_start" &&
    streamEvent.content_block?.type === "tool_use") {
  return formatToolUse(streamEvent.content_block);
}
```

- [ ] **Step 4: Keep Codex/OpenCode structured parsing and reduce over-aggressive dedupe**

```js
function dedupe(text) {
  if (text && text === lastText) return "";
  lastText = text;
  return text;
}
```

### Task 4: Verify the extension still builds and surfaces task output correctly

**Files:**
- Modify if needed: `claude-git-tools/src/task-detail.tsx`
- Modify if needed: `claude-git-tools/src/view-tasks.tsx`

- [ ] **Step 1: Build the extension**

Run: `npm run build`
Expected: Raycast build succeeds with no TypeScript errors

- [ ] **Step 2: Inspect the generated command strings indirectly through buildable code paths**

Run: `npm run build`
Expected: no quoting or type errors from command generation changes

- [ ] **Step 3: Confirm task views still render the same task shape**

```ts
const parts = [`agent: ${task.agent || "claude"}`, `branch: ${task.branch || "unknown"}`];
```

- [ ] **Step 4: Keep finished-task Git link extraction unchanged unless a parser regression forces an adjustment**

```ts
const gitUrl = finished ? extractGitUrl(task, output) : null;
```
