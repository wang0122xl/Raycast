import { execFileSync, spawn, type ChildProcess } from "child_process";
import {
  appendFileSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
} from "fs";
import { join } from "path";
import { tmpdir, homedir } from "os";
import { addTask, updateTask, type Task, type CodeAgent } from "./storage";

export type TaskCommand = "git-push" | "create-pr";

const TASK_DIR = join(tmpdir(), "claude-git-tools-tasks");
const FORMATTER_FILE = join(TASK_DIR, "format-agent-output.js");

let formatterWritten = false;

function ensureTaskDir() {
  if (!existsSync(TASK_DIR)) mkdirSync(TASK_DIR, { recursive: true });
  if (!formatterWritten) {
    writeFileSync(FORMATTER_FILE, outputFormatterScript);
    formatterWritten = true;
  }
}

function buildAgentCmd(agent: CodeAgent, prompt: string): string {
  const quoted = JSON.stringify(prompt);
  switch (agent) {
    case "claude":
      return `claude -p ${quoted} --dangerously-skip-permissions --verbose --output-format stream-json --include-partial-messages`;
    case "codex":
      return `codex exec --full-auto --json ${quoted}`;
    case "opencode":
      return `opencode run --format json --print-logs ${quoted}`;
  }
}

function getCurrentBranch(dir: string): string {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: dir,
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
  } catch {
    return "unknown";
  }
}

const outputFormatterScript = String.raw`
const readline = require("readline");

const seenBlocks = new Set();
let lastText = "";

function asText(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  if (typeof value.text === "string") return value.text;
  if (typeof value.content === "string") return value.content;
  if (typeof value.output === "string") return value.output;
  if (typeof value.stdout === "string") return value.stdout;
  if (typeof value.stderr === "string") return value.stderr;
  if (value.delta) return asText(value.delta);
  return "";
}

function formatToolUse(part) {
  const name = part.name || part.tool_name || "tool";
  const input = part.input || part.arguments || {};
  const command =
    typeof input === "object" && input
      ? input.command || input.cmd || input.description || ""
      : "";

  if (!command) return "";

  return "\n▸ " + name + (command ? ": " + command : "") + "\n";
}

function formatToolResult(part) {
  const content = asText(part.content || part.result || part.output || part);
  if (!content.trim()) return "";
  return "\n" + content.trimEnd() + "\n";
}

function textFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      if (part.type === "tool_use") return formatToolUse(part);
      if (part.type === "tool_result") return formatToolResult(part);
      return asText(part);
    })
    .filter(Boolean)
    .join("");
}

function textFromEvent(event) {
  const contentBlock = event.event?.content_block || event.content_block;
  if (contentBlock?.type === "tool_use") return formatToolUse(contentBlock);
  if (contentBlock?.type === "tool_result") return formatToolResult(contentBlock);

  return (
    asText(event.delta) ||
    asText(event.event?.delta) ||
    asText(event.event?.content_block) ||
    asText(event.event) ||
    asText(event) ||
    textFromContent(event.content) ||
    textFromContent(event.message?.content) ||
    textFromContent(event.event?.message?.content)
  );
}

function dedupe(text) {
  if (!text) return "";
  if (text === lastText) return "";
  lastText = text;

  const normalized = text.trim();
  if (normalized.length > 24) {
    if (seenBlocks.has(normalized)) return "";
    seenBlocks.add(normalized);
  }

  return text;
}

function formatLine(line) {
  try {
    const event = JSON.parse(line);

    if (event.type === "system" || event.type === "result") return "";

    const text = textFromEvent(event);
    if (text) return dedupe(text);

    if (event.type === "tool_use") return dedupe(formatToolUse(event));
    if (event.type === "tool_result") return dedupe(formatToolResult(event));

    const error = asText(event.error);
    if (error) return "\n[error] " + error + "\n";

    return "";
  } catch {
    return line + "\n";
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  const formatted = formatLine(line);
  if (formatted) process.stdout.write(formatted);
});
`;

export function readTaskOutput(task: Task): string {
  try {
    return existsSync(task.outputFile)
      ? cleanTaskOutput(readFileSync(task.outputFile, "utf-8"))
      : "";
  } catch {
    return "";
  }
}

function cleanTaskOutput(output: string): string {
  return output
    .replace(/\u2029/g, "")
    .split("\n")
    .filter(
      (line) =>
        !/^\[(system|stream_event|assistant|result)\]$/.test(line.trim()),
    )
    .filter((line) => !/^\[tool\]\s+\S+\s*$/.test(line.trim()))
    .filter((line) => !/^▸\s+\S+\s*$/.test(line.trim()))
    .filter((line) => line.trim() !== "(Bash completed with no output)")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimStart();
}

function readTaskPid(task: Task): number | null {
  try {
    const pid = readFileSync(task.pidFile, "utf-8").trim();
    const parsed = Number(pid);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function readTaskExitCode(task: Task): number | null {
  try {
    if (!task.exitCodeFile || !existsSync(task.exitCodeFile)) return null;
    const raw = readFileSync(task.exitCodeFile, "utf-8").trim();
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isInteger(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isTaskRunning(task: Task): boolean {
  try {
    const pid = readTaskPid(task);
    if (!pid) return false;
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function getTaskStatus(task: Task): Task["status"] {
  if (task.status !== "running") return task.status;

  const exitCode = readTaskExitCode(task);
  if (exitCode === 0) return "completed";
  if (exitCode !== null)
    return exitCode === 130 || exitCode === 143 ? "stopped" : "failed";

  if (isTaskRunning(task)) return "running";

  const output = readTaskOutput(task).toLowerCase();
  if (output.includes("task stopped by user")) return "stopped";
  return output.includes("failed") || output.includes("error")
    ? "failed"
    : "completed";
}

function signalTaskProcess(task: Task, signal: NodeJS.Signals): boolean {
  const pid = readTaskPid(task);
  if (!pid) return false;

  let signaled = false;
  try {
    process.kill(-pid, signal);
    signaled = true;
  } catch {
    // Older tasks may not have been launched as their own process group.
  }

  try {
    process.kill(pid, signal);
    signaled = true;
  } catch {
    // The process may already have exited after signaling the process group.
  }

  return signaled;
}

export async function stopTask(task: Task): Promise<void> {
  signalTaskProcess(task, "SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 1200));

  if (isTaskRunning(task)) {
    signalTaskProcess(task, "SIGKILL");
  }

  try {
    appendFileSync(task.outputFile, "\n\n[Task stopped by user]\n");
  } catch {
    // Ignore log write failures; the stored status is authoritative.
  }

  if (task.exitCodeFile) {
    try {
      writeFileSync(task.exitCodeFile, "130\n");
    } catch {
      // Best effort for tasks created before exit-code tracking.
    }
  }

  try {
    writeFileSync(task.pidFile, "");
  } catch {
    // Best effort cleanup.
  }

  await updateTask(task.id, { status: "stopped" });
}

export async function launchTask(
  agent: CodeAgent,
  command: TaskCommand,
  prompt: string,
  dir: string,
  label: string,
  options: { targetBranch?: string } = {},
): Promise<Task> {
  ensureTaskDir();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const outputFile = join(TASK_DIR, `${id}.log`);
  const pidFile = join(TASK_DIR, `${id}.pid`);
  const exitCodeFile = join(TASK_DIR, `${id}.exit`);

  writeFileSync(outputFile, "");
  writeFileSync(pidFile, "");
  writeFileSync(exitCodeFile, "");

  const branch = getCurrentBranch(dir);
  const task: Task = {
    id,
    command,
    dir,
    label,
    branch,
    targetBranch: options.targetBranch,
    status: "running",
    outputFile,
    pidFile,
    exitCodeFile,
    startTime: Date.now(),
  };
  await addTask(task);

  const agentCmd = buildAgentCmd(agent, prompt);
  const home = homedir();

  const script = `
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
REPO_NAME=$(basename "$PWD")
TASK_LABEL=${JSON.stringify(label)}
TASK_COMMAND=${JSON.stringify(command)}
OUTPUT_FILE=${JSON.stringify(outputFile)}

trap 'printf "\\n[Task stopped by user]\\n" >> ${JSON.stringify(outputFile)}; printf "130\\n" > ${JSON.stringify(exitCodeFile)}; exit 130' TERM INT

${agentCmd} 2>&1 | node ${JSON.stringify(FORMATTER_FILE)} | tee -a ${JSON.stringify(outputFile)}
EXIT_CODE=\${PIPESTATUS[0]}
printf "%s\\n" "$EXIT_CODE" > ${JSON.stringify(exitCodeFile)}
printf "" > ${JSON.stringify(pidFile)}

if [ $EXIT_CODE -eq 0 ]; then
  OPEN_URL=""
  if [ "$TASK_COMMAND" = "create-pr" ]; then
    OPEN_URL=$(grep -oE 'https://github\\.com/[^/]+/[^/]+/pull/[0-9]+' "$OUTPUT_FILE" | head -1)
  elif [ "$TASK_COMMAND" = "git-push" ]; then
    OPEN_URL=$(grep -oE 'https://(github\\.com|gitlab\\.com|bitbucket\\.org)/[^[:space:]<>")}]+' "$OUTPUT_FILE" | tail -1 | sed 's/[.,;:)]*$//')
    if [ -z "$OPEN_URL" ]; then
      OPEN_URL=$(grep -oE 'https://[^[:space:]<>")}]+' "$OUTPUT_FILE" | tail -1 | sed 's/[.,;:)]*$//')
    fi
  fi

  if [ -n "$OPEN_URL" ]; then
    terminal-notifier -title "$CURRENT_BRANCH" -subtitle "$REPO_NAME" -message "$TASK_LABEL done" -open "$OPEN_URL" -sound Glass 2>/dev/null || true
  else
    terminal-notifier -title "$CURRENT_BRANCH" -subtitle "$REPO_NAME" -message "$TASK_LABEL done" -sound Glass 2>/dev/null || true
  fi
else
  terminal-notifier -title "$CURRENT_BRANCH" -subtitle "$REPO_NAME" -message "$TASK_LABEL failed" -sound Basso 2>/dev/null || true
fi
exit $EXIT_CODE
`.trim();

  const markLaunchFailed = async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    appendFileSync(outputFile, `[failed to start task] ${message}\n`);
    writeFileSync(exitCodeFile, "1\n");
    await updateTask(task.id, { status: "failed" });
  };

  let child: ChildProcess;
  try {
    child = spawn("/bin/bash", ["-lc", script], {
      cwd: dir,
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        PATH: `${home}/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ""}`,
      },
    });
  } catch (error) {
    await markLaunchFailed(error);
    throw error;
  }

  child.on("error", (error) => {
    void markLaunchFailed(error);
  });

  child.unref();

  if (child.pid) {
    writeFileSync(pidFile, String(child.pid));
  } else {
    writeFileSync(exitCodeFile, "1\n");
    await updateTask(task.id, { status: "failed" });
  }

  return task;
}
