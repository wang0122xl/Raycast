import { execFileSync, spawn, type ChildProcess } from "child_process";
import {
  appendFileSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  statSync,
  unlinkSync,
  closeSync,
} from "fs";
import { join } from "path";
import { tmpdir, homedir } from "os";
import {
  addTask,
  getAgentForCommand,
  getClaudeModelForCommand,
  getCodexModelForCommand,
  getGeminiModelForCommand,
  getSkillPath,
  removeTask,
  updateTask,
  type Agent,
  type CodexModel,
  type GeminiModel,
  type Task,
} from "./storage";
import { dirFromPath } from "./git-utils";

export type TaskCommand = "git-push" | "create-pr" | "review-pr";

const TASK_DIR = join(tmpdir(), "claude-git-tools-tasks");
const FORMATTER_FILE = join(TASK_DIR, "format-agent-output.js");
const STALE_TASK_MAX_AGE_MS = 10 * 60 * 1000;
const TASK_OUTPUT_PREVIEW_BYTES = 128 * 1024;

let formatterWritten = false;

interface TaskOptions {
  targetBranch?: string;
  prUrl?: string;
  skillPath?: string;
  skillName?: string;
  skillDir?: string;
  agent?: Agent;
}

export function skillPathToName(path: string): string {
  const base = path.split("/").pop() || "";
  return base.replace(/\.md$/i, "");
}

export async function getSkillOptionsForCommand(command: TaskCommand): Promise<{
  skillPath?: string;
  skillName?: string;
  skillDir?: string;
  agent: Agent;
}> {
  const [path, agent] = await Promise.all([
    getSkillPath(command),
    getAgentForCommand(command),
  ]);
  if (!path) return { agent };
  const name = skillPathToName(path);
  const dir = dirFromPath(path);
  return { skillPath: path, skillName: name, skillDir: dir, agent };
}

function ensureTaskDir() {
  if (!existsSync(TASK_DIR)) mkdirSync(TASK_DIR, { recursive: true });
  if (
    !formatterWritten ||
    !existsSync(FORMATTER_FILE) ||
    readFileSync(FORMATTER_FILE, "utf-8") !== outputFormatterScript
  ) {
    writeFileSync(FORMATTER_FILE, outputFormatterScript);
    formatterWritten = true;
  }
}

function shellQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

function requireTargetBranch(options: TaskOptions): string {
  const targetBranch = options.targetBranch?.trim();
  if (!targetBranch) {
    throw new Error("Target branch is required for create-pr");
  }
  return targetBranch;
}

function getSkillFile(options: TaskOptions): string {
  if (options.skillPath && existsSync(options.skillPath)) {
    return options.skillPath;
  }

  if (options.skillDir && options.skillName) {
    const candidate = join(options.skillDir, `${options.skillName}.md`);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return "";
}

function buildTaskPrompt(command: TaskCommand, options: TaskOptions): string {
  if (command === "git-push") {
    return "Execute the task described in the appended system prompt";
  }
  if (command === "create-pr") {
    const branch = requireTargetBranch(options);
    return `$ARGUMENTS=${branch}`;
  }
  const prUrl = options.prUrl || "";
  return `$ARGUMENTS=${prUrl}`;
}

function buildTaskPromptWithSkill(
  command: TaskCommand,
  options: TaskOptions,
  skillFile: string,
): string {
  const skillText = readFileSync(skillFile, "utf-8");
  return [
    "Follow the skill instructions below to complete this task. Treat them as the appended system prompt referenced by the task.",
    "",
    "```md",
    skillText.replace(/```/g, "'''"),
    "```",
    "",
    buildTaskPrompt(command, options),
  ].join("\n");
}

function buildClaudeCommand(
  command: TaskCommand,
  options: TaskOptions,
  model: string,
  skillFile: string,
): string {
  const prompt = buildTaskPrompt(command, options);

  const allowedTools = [
    "Bash(git:*)",
    "Bash(gh:*)",
    "Bash(ls:*)",
    "Bash(cat:*)",
    "Bash(find:*)",
    "Bash(grep:*)",
    "Bash(mkdir:*)",
    "Bash(cp:*)",
    "Bash(wc:*)",
    "Read",
    "Write",
    "Edit",
    "Grep",
    "Glob",
  ].join(",");

  const parts = [
    "claude",
    "-p",
    "--allowedTools",
    shellQuote(allowedTools),
    "--verbose",
    "--model",
    shellQuote(model),
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--include-hook-events",
  ];

  if (skillFile) {
    parts.push("--append-system-prompt-file", shellQuote(skillFile));
  }

  parts.push("--", shellQuote(prompt));

  return parts.join(" ");
}

function buildCodexCommand(promptFile: string, model: CodexModel): string {
  return [
    "codex",
    "exec",
    "--model",
    shellQuote(model),
    "--json",
    "--color",
    "never",
    "--dangerously-bypass-approvals-and-sandbox",
    "-",
    "<",
    shellQuote(promptFile),
  ].join(" ");
}

function buildOpenCodeCommand(promptFile: string): string {
  return buildOpenCodeCommandWithPrompt(readFileSync(promptFile, "utf-8"));
}

function buildOpenCodeCommandWithPrompt(prompt: string): string {
  return [
    "opencode",
    "run",
    "--format",
    "json",
    "--dangerously-skip-permissions",
    "--",
    shellQuote(prompt),
  ].join(" ");
}

function buildGeminiCommand(promptFile: string, model: GeminiModel): string {
  return buildGeminiCommandWithPrompt(readFileSync(promptFile, "utf-8"), model);
}

function buildGeminiCommandWithPrompt(
  prompt: string,
  model: GeminiModel,
): string {
  return [
    "gemini",
    "--model",
    shellQuote(model),
    "--prompt",
    shellQuote(prompt),
    "--output-format",
    "stream-json",
    "--skip-trust",
    "--approval-mode",
    "yolo",
  ].join(" ");
}

function formatCommandLineForDisplay(commandLine: string): string {
  return commandLine.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
}

function formatPromptPlaceholder(skillFile: string): string {
  return `[prompt omitted; see ${skillFile}]`;
}

function getTaskFileId(name: string): string | null {
  const match = name.match(/^([a-z0-9]+)\.(log|pid|exit|fifo)$/i);
  return match ? match[1] : null;
}

function reapStaleTaskProcesses() {
  if (!existsSync(TASK_DIR)) return;

  const now = Date.now();
  const staleIds = new Set<string>();

  for (const name of readdirSync(TASK_DIR)) {
    const taskId = getTaskFileId(name);
    if (!taskId) continue;

    const path = join(TASK_DIR, name);
    let isOld = false;
    try {
      isOld = now - statSync(path).mtimeMs > STALE_TASK_MAX_AGE_MS;
    } catch {
      continue;
    }
    if (!isOld) continue;

    if (name.endsWith(".fifo")) {
      staleIds.add(taskId);
      continue;
    }

    if (!name.endsWith(".pid")) continue;

    try {
      if (!readFileSync(path, "utf-8").trim()) {
        staleIds.add(taskId);
      }
    } catch {
      staleIds.add(taskId);
    }
  }

  if (!staleIds.size) return;

  let processList = "";
  try {
    processList = execFileSync("ps", ["-axo", "pid=,command="], {
      encoding: "utf-8",
      timeout: 5000,
    });
  } catch {
    processList = "";
  }

  for (const line of processList.split("\n")) {
    const match = line.match(/^\s*(\d+)\s+(.*)$/);
    if (!match) continue;

    const pid = Number(match[1]);
    const command = match[2];
    if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) continue;
    if (!command.includes(TASK_DIR)) continue;
    if (![...staleIds].some((taskId) => command.includes(taskId))) continue;

    try {
      process.kill(pid, "SIGTERM");
    } catch {
      continue;
    }

    try {
      process.kill(pid, 0);
      process.kill(pid, "SIGKILL");
    } catch {
      // The process exited after SIGTERM.
    }
  }

  for (const taskId of staleIds) {
    const fifoPath = join(TASK_DIR, `${taskId}.fifo`);
    if (!existsSync(fifoPath)) continue;
    try {
      unlinkSync(fifoPath);
    } catch {
      // Best effort cleanup for legacy FIFO-based launches.
    }
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

const claudeToolUses = new Set();
const claudeToolResults = new Set();
const codexCommandStarts = new Set();
const ansiPattern = new RegExp("\\x1B(?:[@-Z\\\\-_]|\\[[0-?]*[ -/]*[@-~])", "g");
let attachmentBlock = null;
let geminiPromptEcho = false;
let geminiStackTrace = false;
let geminiModelErrorShown = false;

function asText(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join("");
  if (!value || typeof value !== "object") return "";
  if (typeof value.text === "string") return value.text;
  if (typeof value.content === "string") return value.content;
  if (Array.isArray(value.content)) return value.content.map(asText).filter(Boolean).join("");
  if (typeof value.output === "string") return value.output;
  if (typeof value.stdout === "string") return value.stdout;
  if (typeof value.stderr === "string") return value.stderr;
  if (typeof value.message === "string") return value.message;
  if (value.delta) return asText(value.delta);
  if (value.result) return asText(value.result);
  return "";
}

function firstText() {
  for (const value of arguments) {
    const text = asText(value);
    if (text) return text;
  }
  return "";
}

function toolCommandFromInput(input) {
  if (typeof input === "string") return input;
  if (!input || typeof input !== "object") return "";
  return input.command || input.cmd || input.description || input.query || input.prompt || "";
}

function formatToolUse(part) {
  const name = part.name || part.tool_name || part.tool || "tool";
  const command = toolCommandFromInput(
    part.input || part.arguments || part.parameters || part.state?.input || part.payload,
  );
  if (!command) return "";

  return "\n▸ " + name + ": " + command + "\n";
}

function formatToolResult(part) {
  const content = asText(part.content || part.result || part.output || part.state?.output || part);
  if (!content.trim()) return "";
  return "\n" + content.trimEnd() + "\n";
}

function buildClaudePartKey(part) {
  return JSON.stringify([
    part.id || part.tool_use_id || "",
    part.name || part.tool_name || part.tool || "",
    toolCommandFromInput(part.input || part.arguments || part.parameters || part.state?.input || part.payload),
    asText(part.content || part.result || part.output || part.state?.output),
  ]);
}

function formatClaudeToolUse(part) {
  const key = buildClaudePartKey(part);
  if (claudeToolUses.has(key)) return "";
  claudeToolUses.add(key);
  return formatToolUse(part);
}

function formatClaudeToolResult(part) {
  const key = buildClaudePartKey(part);
  if (claudeToolResults.has(key)) return "";
  claudeToolResults.add(key);
  return formatToolResult(part);
}

function formatClaudeContent(content) {
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      if (part.type === "tool_use") return formatClaudeToolUse(part);
      if (part.type === "tool_result") return formatClaudeToolResult(part);
      return "";
    })
    .filter(Boolean)
    .join("");
}

function formatClaudeHook(event) {
  const hookName =
    event.hook_event_name ||
    event.subtype ||
    event.event?.hook_event_name ||
    event.hook?.name ||
    "hook";
  const payload = event.payload || event.data || event.hook || event.event || {};
  const command = toolCommandFromInput(
    payload.input || payload.arguments || payload.parameters || event.input || event.arguments || payload,
  );
  const output = asText(payload.output || payload.stdout || payload.stderr || payload.message || event.message);

  if (command) {
    return "\n▸ " + hookName + ": " + command + "\n" + (output ? output.trimEnd() + "\n" : "");
  }

  if (output.trim()) {
    return "\n[" + hookName + "] " + output.trimEnd() + "\n";
  }

  return "";
}

function formatClaude(event) {
  if (event.type === "system" || event.type === "result") return "";

  if (event.type === "stream_event") {
    const streamEvent = event.event;
    if (!streamEvent || typeof streamEvent !== "object") return "";

    if (
      streamEvent.type === "content_block_delta" &&
      streamEvent.delta?.type === "text_delta"
    ) {
      return streamEvent.delta.text || "";
    }

    if (
      streamEvent.type === "content_block_start" &&
      streamEvent.content_block?.type === "tool_use"
    ) {
      return formatClaudeToolUse(streamEvent.content_block);
    }

    if (
      streamEvent.type === "content_block_start" &&
      streamEvent.content_block?.type === "tool_result"
    ) {
      return formatClaudeToolResult(streamEvent.content_block);
    }

    return "";
  }

  if (event.type === "assistant") {
    return formatClaudeContent(event.message?.content || event.event?.message?.content);
  }

  if (
    event.type === "hook" ||
    event.type === "hook_event" ||
    event.type === "hook-event" ||
    event.hook_event_name
  ) {
    return formatClaudeHook(event);
  }

  if (event.type === "tool_use") return formatClaudeToolUse(event);
  if (event.type === "tool_result") return formatClaudeToolResult(event);

  const error = asText(event.error);
  if (error) return "\n[error] " + error + "\n";

  return "";
}

function formatGenericAgent(event) {
  if (!event || typeof event !== "object") return "";

  const type = String(event.type || event.kind || event.event || "");
  const lowerType = type.toLowerCase();
  const payload =
    event.item ||
    event.part ||
    event.tool ||
    event.command ||
    event.data ||
    event.properties ||
    event;

  if (
    lowerType.includes("error") ||
    lowerType.includes("failed") ||
    lowerType.includes("failure")
  ) {
    const text = asText(
      event.message ||
        event.error ||
        event.data?.message ||
        event.data?.error ||
        payload,
    );
    return text ? "\n[error] " + text.trimEnd() + "\n" : "";
  }

  if (
    lowerType.includes("tool") ||
    lowerType.includes("command") ||
    lowerType.includes("exec") ||
    lowerType.includes("bash")
  ) {
    const formattedUse = formatToolUse(payload);
    if (formattedUse) return formattedUse;
    const formattedResult = formatToolResult(payload);
    if (formattedResult) return formattedResult;
  }

  const text = firstText(
    event.delta,
    stripAttachmentBlocks(event.text || ""),
    event.message,
    event.content,
    event.output,
    event.result,
    event.data,
    event.data?.text,
    event.data?.message,
    event.data?.content,
    event.item,
  );
  return text ? text : "";
}

function formatCodex(event) {
  const type = String(event.type || "");

  if (
    type === "thread.started" ||
    type === "turn.started" ||
    type === "turn.completed" ||
    type === "token_count" ||
    type === "rate_limits"
  ) {
    return "";
  }

  if (type === "item.started" || type === "item.completed") {
    return formatCodexItem(event.item, type);
  }

  return formatGenericAgent(event);
}

function isCodexNoise(text) {
  return (
    text.includes("[features].codex_hooks") ||
    text.includes("Use [features].hooks instead") ||
    text.includes("rmcp::transport::worker") ||
    text.includes("Unexpected content type")
  );
}

function stripCodexCodeSnippets(text) {
  const fence = String.fromCharCode(96).repeat(3);
  const fencedBlockPattern = new RegExp(fence + "[\\s\\S]*?" + fence, "g");
  const replacements = [];
  let nextText = text
    .replace(fencedBlockPattern, (block) => {
      replacements.push("[code block omitted: " + block.split("\n").length + " lines]");
      return replacements[replacements.length - 1];
    })
    .replace(/\*\*\* Begin Patch[\s\S]*?\*\*\* End Patch/g, (block) => {
      replacements.push("[patch omitted: " + block.split("\n").length + " lines]");
      return replacements[replacements.length - 1];
    });

  const lines = nextText.split("\n");
  const result = [];
  let codeLines = [];

  function flushCodeLines() {
    if (codeLines.length >= 6) {
      result.push("[code snippet omitted: " + codeLines.length + " lines]");
    } else {
      result.push(...codeLines);
    }
    codeLines = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();
    const unnumbered = trimmed.replace(/^\d+\s+/, "");
    const looksLikeCode =
      /^\d+\s+\S/.test(trimmed) ||
      /^@@\s+-\d+/.test(trimmed) ||
      /^(diff --git|index [0-9a-f]+\.\.|--- |\+\+\+ )/.test(trimmed) ||
      /^(import|export|const|let|var|function|class|interface|type|return|if|for|while|switch|case|try|catch)\b/.test(trimmed) ||
      /^(class|module_path|kwargs|handler|dataset|segments|train|valid|test|record):\s*/.test(unnumbered) ||
      /^[+\- ]{0,3}(import|export|const|let|var|function|class|interface|type|return)\b/.test(line) ||
      /^[+\-]\s*\S/.test(line) ||
      /^[+\- ]{0,3}[}\]);,]+$/.test(line) ||
      /^[+\- ]{0,3}<\/?[A-Za-z][^>]*>$/.test(line);

    if (looksLikeCode) {
      codeLines.push(line);
      continue;
    }

    flushCodeLines();
    result.push(line);
  }

  flushCodeLines();

  return result
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

function extractCodexUrls(text) {
  const matches = text.match(/https:\/\/[^\s<>")}]*/g) || [];
  return [...new Set(matches.map((url) => url.replace(/[.,;:)']*$/, "")))];
}

function isCodexSourceOutputCommand(command) {
  return (
    /\b(nl|cat)\b/.test(command) ||
    /\bsed\b.*\b-n\b/.test(command) ||
    /\bgit\s+(diff|show)\b/.test(command) ||
    /\brg\b.*\b(-n|--line-number)\b/.test(command)
  );
}

function formatCodexCommandOutput(command, output) {
  if (!output.trim()) return "";

  if (isCodexSourceOutputCommand(command)) {
    const urls = extractCodexUrls(output);
    return [
      "[command output omitted: source/code content]",
      ...urls,
    ].join("\n") + "\n";
  }

  const filtered = stripCodexCodeSnippets(output);
  return filtered.trim() ? filtered + "\n" : "";
}

function formatCodexItem(item, eventType) {
  if (!item || typeof item !== "object") return "";

  if (item.type === "agent_message") {
    const text = asText(item.text || item.content || item.message);
    if (!text.trim() || isCodexNoise(text)) return "";
    const filtered = stripCodexCodeSnippets(text);
    return filtered.trim() ? filtered + "\n\n" : "";
  }

  if (item.type === "command_execution") {
    const command = item.command || item.cmd || "";
    const key = item.id || command;

    if (eventType === "item.started") {
      if (!command || codexCommandStarts.has(key)) return "";
      codexCommandStarts.add(key);
      return "\n▸ shell: " + command + "\n";
    }

    const output = asText(item.aggregated_output || item.output || item.stdout || item.stderr);
    const formattedOutput = formatCodexCommandOutput(command, output);
    if (formattedOutput) return formattedOutput;
    if (item.exit_code && item.exit_code !== 0) {
      return "[exit " + item.exit_code + "]\n";
    }
    return "";
  }

  if (item.type === "error") {
    const text = asText(item.message || item.error || item);
    if (!text.trim() || isCodexNoise(text)) return "";
    return "\n[error] " + text.trimEnd() + "\n";
  }

  const text = asText(item);
  if (!text.trim() || isCodexNoise(text)) return "";
  const filtered = stripCodexCodeSnippets(text);
  return filtered.trim() ? filtered + "\n" : "";
}

function formatOpenCode(event) {
  const type = String(event.type || event.event || "").toLowerCase();
  const formatted = formatGenericAgent(event);
  if (formatted.trim()) return formatted;

  if (
    type.includes("session") ||
    type.includes("permission") ||
    type.includes("storage")
  ) {
    return "";
  }
  return formatGenericAgent(event);
}

function formatGemini(event) {
  const type = String(event.type || event.kind || event.event || "").toLowerCase();
  const role = String(event.role || "").toLowerCase();

  if (
    type === "init" ||
    (type === "message" && role === "user") ||
    (type === "result" && event.status === "success")
  ) {
    return "";
  }

  if (
    type.includes("usage") ||
    type.includes("token") ||
    type.includes("metadata") ||
    type.includes("stats")
  ) {
    return "";
  }

  if (
    type.includes("tool") ||
    type.includes("function") ||
    type.includes("command") ||
    type.includes("exec")
  ) {
    const payload =
      event.tool ||
      event.functionCall ||
      event.function_call ||
      event.call ||
      event.data ||
      event;
    const formattedUse = formatToolUse(payload);
    if (formattedUse) return formattedUse;
    const formattedResult = formatToolResult(payload);
    if (formattedResult) return formattedResult;
  }

  return formatGenericAgent(event);
}

function formatGeminiPlainLine(line) {
  const trimmed = line.trim();

  if (!trimmed && geminiPromptEcho) return "";

  if (
    trimmed === "Warning: 256-color support not detected. Using a terminal with at least 256-color support is recommended for a better visual experience." ||
    trimmed === "YOLO mode is enabled. All tool calls will be automatically approved." ||
    trimmed === "Ripgrep is not available. Falling back to GrepTool." ||
    (trimmed.startsWith("Skill ") && trimmed.includes(" is overriding "))
  ) {
    return "";
  }

  if (trimmed.startsWith("Follow the skill instructions below to complete this task.")) {
    geminiPromptEcho = true;
    return "";
  }

  if (geminiPromptEcho) {
    if (
      trimmed.startsWith("Execute the task described in the appended system prompt") ||
      trimmed.startsWith("$ARGUMENTS=")
    ) {
      geminiPromptEcho = false;
    }
    return "";
  }

  if (trimmed.startsWith("Error when talking to Gemini API")) {
    geminiStackTrace = true;
    if (
      trimmed.includes("ModelNotFoundError") ||
      trimmed.includes("Requested entity was not found")
    ) {
      if (geminiModelErrorShown) return "";
      geminiModelErrorShown = true;
      const model = process.env.AGENT_MODEL || "selected Gemini model";
      return "\n[error] Gemini model not found (404): " + model + ". Select another Gemini model in Manage Models.\n";
    }
    return "\n[error] Gemini API request failed.\n";
  }

  if (
    trimmed.includes("ModelNotFoundError") ||
    trimmed.includes("Requested entity was not found")
  ) {
    geminiStackTrace = true;
    if (geminiModelErrorShown) return "";
    geminiModelErrorShown = true;
    const model = process.env.AGENT_MODEL || "selected Gemini model";
    return "[error] Gemini model not found (404): " + model + ". Select another Gemini model in Manage Models.\n";
  }

  if (geminiStackTrace) {
    if (
      trimmed === "}" ||
      trimmed.startsWith("at ") ||
      trimmed.startsWith("code:") ||
      /^at\s+/.test(trimmed) ||
      /^[A-Za-z]+Error:/.test(trimmed)
    ) {
      if (trimmed === "}") geminiStackTrace = false;
      return "";
    }
  }

  return stripAttachmentBlocks(line) + "\n";
}

function formatLine(line) {
  try {
    const event = JSON.parse(line);
    if (process.env.AGENT === "codex") return formatCodex(event);
    if (process.env.AGENT === "opencode") return formatOpenCode(event);
    if (process.env.AGENT === "gemini") return formatGemini(event);
    return formatClaude(event);
  } catch {
    const cleaned = line.replace(ansiPattern, "");
    if (process.env.AGENT === "codex" && isCodexNoise(cleaned)) return "";
    if (process.env.AGENT === "gemini") return formatGeminiPlainLine(cleaned);
    if (
      process.env.AGENT === "codex" &&
      cleaned.trim() === "Reading additional input from stdin..."
    ) {
      return "";
    }
    return stripAttachmentBlocks(cleaned) + "\n";
  }
}

function stripAttachmentBlocks(output) {
  return output
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (attachmentBlock) {
        if (trimmed === "</" + attachmentBlock + ">") {
          attachmentBlock = null;
        }
        return false;
      }
      const start = trimmed.match(/^<(skill_content|skill_files|content|path|type|file)(\\s|>)/);
      if (start) {
        attachmentBlock = start[1];
        return false;
      }
      return true;
    })
    .join("\n");
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

export function readTaskOutputPreview(task: Task): string {
  try {
    if (!existsSync(task.outputFile)) return "";
    const size = statSync(task.outputFile).size;
    if (size <= TASK_OUTPUT_PREVIEW_BYTES) {
      return cleanTaskOutput(readFileSync(task.outputFile, "utf-8"));
    }

    const fd = openSync(task.outputFile, "r");
    try {
      const buffer = Buffer.alloc(TASK_OUTPUT_PREVIEW_BYTES);
      const start = Math.max(0, size - TASK_OUTPUT_PREVIEW_BYTES);
      const bytesRead = readSync(
        fd,
        buffer,
        0,
        TASK_OUTPUT_PREVIEW_BYTES,
        start,
      );
      const rawTail = buffer.subarray(0, bytesRead).toString("utf-8");
      const tail = rawTail.replace(/^[^\n]*(\n|$)/, "");
      const cleaned = cleanTaskOutput(tail);
      return [
        `[output truncated: showing last ${Math.round(TASK_OUTPUT_PREVIEW_BYTES / 1024)} KB of ${Math.round(size / 1024)} KB]`,
        "",
        cleaned,
      ].join("\n");
    } finally {
      closeSync(fd);
    }
  } catch {
    return "";
  }
}

function cleanTaskOutput(output: string): string {
  const ansiPattern = new RegExp(
    `${String.fromCharCode(27)}(?:[@-Z\\\\-_]|\\[[0-?]*[ -/]*[@-~])`,
    "g",
  );

  return cleanAgentOutput(output.replace(ansiPattern, ""))
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

function cleanAgentOutput(output: string): string {
  let suppressGeminiPromptEcho = false;
  let suppressGeminiStackTrace = false;
  let geminiModelErrorShown = false;
  const lines: string[] = [];

  for (const line of output.split("\n")) {
    const trimmed = line.trim();

    if (
      trimmed ===
        "Warning: 256-color support not detected. Using a terminal with at least 256-color support is recommended for a better visual experience." ||
      trimmed ===
        "YOLO mode is enabled. All tool calls will be automatically approved." ||
      trimmed === "Ripgrep is not available. Falling back to GrepTool." ||
      (trimmed.startsWith("Skill ") && trimmed.includes(" is overriding "))
    ) {
      continue;
    }

    if (
      trimmed.startsWith(
        "Follow the skill instructions below to complete this task.",
      )
    ) {
      suppressGeminiPromptEcho = true;
      continue;
    }

    if (suppressGeminiPromptEcho) {
      if (
        trimmed.startsWith(
          "Execute the task described in the appended system prompt",
        ) ||
        trimmed.startsWith("$ARGUMENTS=")
      ) {
        suppressGeminiPromptEcho = false;
      }
      continue;
    }

    if (trimmed.startsWith("Error when talking to Gemini API")) {
      suppressGeminiStackTrace = true;
      if (
        trimmed.includes("ModelNotFoundError") ||
        trimmed.includes("Requested entity was not found")
      ) {
        if (!geminiModelErrorShown) {
          lines.push(
            "[error] Gemini model not found (404). Select another Gemini model in Manage Models.",
          );
          geminiModelErrorShown = true;
        }
      } else {
        lines.push("[error] Gemini API request failed.");
      }
      continue;
    }

    if (
      trimmed.includes("ModelNotFoundError") ||
      trimmed.includes("Requested entity was not found")
    ) {
      suppressGeminiStackTrace = true;
      if (!geminiModelErrorShown) {
        lines.push(
          "[error] Gemini model not found (404). Select another Gemini model in Manage Models.",
        );
        geminiModelErrorShown = true;
      }
      continue;
    }

    if (suppressGeminiStackTrace) {
      if (
        trimmed === "}" ||
        trimmed.startsWith("at ") ||
        trimmed.startsWith("code:") ||
        /^at\s+/.test(trimmed) ||
        /^[A-Za-z]+Error:/.test(trimmed)
      ) {
        if (trimmed === "}") suppressGeminiStackTrace = false;
        continue;
      }
    }

    lines.push(line);
  }

  return lines.join("\n");
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
  if (task.status === "canceled") return "stopped";
  if (task.status !== "running") return task.status;

  const exitCode = readTaskExitCode(task);
  if (exitCode === 0) return "completed";
  if (exitCode !== null) {
    return exitCode === 130 || exitCode === 143 ? "stopped" : "failed";
  }

  if (isTaskRunning(task)) return "running";

  const output = readTaskOutput(task).toLowerCase();
  if (output.includes("task canceled by user")) return "stopped";
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
    appendFileSync(task.outputFile, "\n\n[Task canceled by user]\n");
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
  command: TaskCommand,
  dir: string,
  label: string,
  options: TaskOptions = {},
): Promise<Task | null> {
  ensureTaskDir();
  reapStaleTaskProcesses();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const outputFile = join(TASK_DIR, `${id}.log`);
  const pidFile = join(TASK_DIR, `${id}.pid`);
  const exitCodeFile = join(TASK_DIR, `${id}.exit`);
  const promptFile = join(TASK_DIR, `${id}.prompt`);

  writeFileSync(outputFile, "");
  writeFileSync(pidFile, "");
  writeFileSync(exitCodeFile, "");

  const selectedAgent = options.agent || (await getAgentForCommand(command));
  const branch = getCurrentBranch(dir);
  const task: Task = {
    id,
    command,
    dir,
    label,
    branch,
    targetBranch: options.targetBranch,
    prUrl: options.prUrl,
    status: "running",
    outputFile,
    pidFile,
    exitCodeFile,
    agent: selectedAgent,
    startTime: Date.now(),
  };
  await addTask(task);

  const skillFile = getSkillFile(options);
  if (!skillFile) {
    await removeTask(task.id);
    return null;
  }

  const prompt = buildTaskPromptWithSkill(command, options, skillFile);
  writeFileSync(promptFile, prompt);

  const [claudeModel, codexModel, geminiModel] = await Promise.all([
    getClaudeModelForCommand(command),
    getCodexModelForCommand(command),
    getGeminiModelForCommand(command),
  ]);
  const agentModel =
    selectedAgent === "claude"
      ? claudeModel
      : selectedAgent === "codex"
        ? codexModel
        : selectedAgent === "gemini"
          ? geminiModel
          : "";
  const agentCommand =
    selectedAgent === "claude"
      ? buildClaudeCommand(command, options, claudeModel, skillFile)
      : selectedAgent === "codex"
        ? buildCodexCommand(promptFile, codexModel)
        : selectedAgent === "opencode"
          ? buildOpenCodeCommand(promptFile)
          : buildGeminiCommand(promptFile, geminiModel);
  const promptPlaceholder = formatPromptPlaceholder(
    options.skillPath || skillFile,
  );
  const displayCommand =
    selectedAgent === "opencode"
      ? buildOpenCodeCommandWithPrompt(promptPlaceholder)
      : selectedAgent === "gemini"
        ? buildGeminiCommandWithPrompt(promptPlaceholder, geminiModel)
        : agentCommand;
  task.commandLine = formatCommandLineForDisplay(displayCommand);
  await updateTask(task.id, { commandLine: task.commandLine });
  const home = homedir();

  const script = `
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
START_HEAD=$(git rev-parse HEAD 2>/dev/null || echo "")
REPO_NAME=$(basename "$PWD")
TASK_LABEL=${JSON.stringify(label)}
TASK_COMMAND=${JSON.stringify(command)}
TASK_AGENT=${JSON.stringify(selectedAgent)}
TASK_PR_URL=${JSON.stringify(options.prUrl || "")}
OUTPUT_FILE=${JSON.stringify(outputFile)}
PID_FILE=${JSON.stringify(pidFile)}

trap 'printf "\\n[Task canceled by user]\\n" >> ${JSON.stringify(outputFile)}; printf "130\\n" > ${JSON.stringify(exitCodeFile)}; exit 130' TERM INT

cleanup_residual_processes() {
  local roots descendants
  roots="$$"
  descendants=""

  while [ -n "$roots" ]; do
    local children
    children=$(ps -axo pid=,ppid= 2>/dev/null | awk -v roots=" $roots " '
      index(roots, " " $2 " ") { print $1 }
    ')
    if [ -z "$children" ]; then
      break
    fi

    descendants="$descendants $children"
    roots=$(echo "$children" | tr '\n' ' ' | xargs)
  done

  descendants=$(echo "$descendants" | xargs)
  if [ -z "$descendants" ]; then
    return 0
  fi

  kill -TERM $descendants 2>/dev/null || true
  sleep 0.3

  roots="$$"
  descendants=""
  while [ -n "$roots" ]; do
    local children
    children=$(ps -axo pid=,ppid= 2>/dev/null | awk -v roots=" $roots " '
      index(roots, " " $2 " ") { print $1 }
    ')
    if [ -z "$children" ]; then
      break
    fi

    descendants="$descendants $children"
    roots=$(echo "$children" | tr '\n' ' ' | xargs)
  done

  descendants=$(echo "$descendants" | xargs)
  if [ -n "$descendants" ]; then
    kill -KILL $descendants 2>/dev/null || true
  fi
}

extract_first_markdown_url() {
  local pattern="$1"
  perl -ne 'while (/\\[[^\\]]*?\\]\\((https:\\/\\/[^)\\s]+)\\)/g) { print "$1\\n" }' "$OUTPUT_FILE" | grep -E "$pattern" | head -1 | sed "s/[.,;:)']*$//"
}

extract_last_markdown_url() {
  local pattern="$1"
  perl -ne 'while (/\\[[^\\]]*?\\]\\((https:\\/\\/[^)\\s]+)\\)/g) { print "$1\\n" }' "$OUTPUT_FILE" | grep -E "$pattern" | tail -1 | sed "s/[.,;:)']*$//"
}

${agentCommand} 2>&1 | AGENT=${JSON.stringify(selectedAgent)} AGENT_MODEL=${JSON.stringify(agentModel)} node ${JSON.stringify(FORMATTER_FILE)} | tee -a ${JSON.stringify(outputFile)}
EXIT_CODE=\${PIPESTATUS[0]}
cleanup_residual_processes

if [ $EXIT_CODE -eq 0 ]; then
  OPEN_URL=""
  if [ "$TASK_COMMAND" = "create-pr" ]; then
    OPEN_URL=$(extract_last_markdown_url '^https://github\\.com/[^/]+/[^/]+/pull/[0-9]+$')
    if [ -z "$OPEN_URL" ]; then
      OPEN_URL=$(grep -oE 'https://github\\.com/[^/]+/[^/]+/pull/[0-9]+' "$OUTPUT_FILE" | tail -1)
    fi
    if [ -z "$OPEN_URL" ]; then
      OPEN_URL=$(extract_last_markdown_url '^https://gitlab\\.com/[^[:space:]<>")}]*/-/(merge_requests)/[0-9]+$')
    fi
    if [ -z "$OPEN_URL" ]; then
      OPEN_URL=$(grep -oE 'https://gitlab\\.com/[^[:space:]<>")}]*/-/(merge_requests)/[0-9]+' "$OUTPUT_FILE" | tail -1)
    fi
    if [ -z "$OPEN_URL" ]; then
      OPEN_URL=$(extract_last_markdown_url '^https://bitbucket\\.org/[^[:space:]<>")}]*/pull-requests/[0-9]+$')
    fi
    if [ -z "$OPEN_URL" ]; then
      OPEN_URL=$(grep -oE 'https://bitbucket\\.org/[^[:space:]<>")}]*/pull-requests/[0-9]+' "$OUTPUT_FILE" | tail -1)
    fi
    if [ -z "$OPEN_URL" ]; then
      OPEN_URL=$(gh pr view --json url --jq .url 2>/dev/null || echo "")
      if [ -n "$OPEN_URL" ]; then
        printf "\\n%s\\n" "$OPEN_URL" >> "$OUTPUT_FILE"
      fi
    fi
  elif [ "$TASK_COMMAND" = "review-pr" ]; then
    if [ -n "$TASK_PR_URL" ]; then
      OPEN_URL="$TASK_PR_URL"
    else
      OPEN_URL=$(extract_first_markdown_url '^https://github\\.com/[^/]+/[^/]+/pull/[0-9]+$')
      if [ -z "$OPEN_URL" ]; then
        OPEN_URL=$(grep -oE 'https://github\\.com/[^/]+/[^/]+/pull/[0-9]+' "$OUTPUT_FILE" | head -1)
      fi
      if [ -z "$OPEN_URL" ]; then
        OPEN_URL=$(extract_first_markdown_url '^https://gitlab\\.com/[^[:space:]<>")}]*/-/(merge_requests)/[0-9]+$')
      fi
      if [ -z "$OPEN_URL" ]; then
        OPEN_URL=$(grep -oE 'https://gitlab\\.com/[^[:space:]<>")}]*/-/(merge_requests)/[0-9]+' "$OUTPUT_FILE" | head -1)
      fi
      if [ -z "$OPEN_URL" ]; then
        OPEN_URL=$(extract_first_markdown_url '^https://bitbucket\\.org/[^[:space:]<>")}]*/pull-requests/[0-9]+$')
      fi
      if [ -z "$OPEN_URL" ]; then
        OPEN_URL=$(grep -oE 'https://bitbucket\\.org/[^[:space:]<>")}]*/pull-requests/[0-9]+' "$OUTPUT_FILE" | head -1)
      fi
    fi
    if ! grep -q '!--------!' "$OUTPUT_FILE"; then
      PR_TARGET="$TASK_PR_URL"
      if [ -z "$PR_TARGET" ]; then
        PR_TARGET="$OPEN_URL"
      fi
      if [ -n "$PR_TARGET" ]; then
        gh pr view "$PR_TARGET" --json title,author,baseRefName,headRefName,url,additions,deletions,changedFiles --jq '"'"'
          "!--------!\n# PR 审查报告\n\n## PR 信息\n- **标题**: " + .title +
          "\n- **作者**: " + .author.login +
          "\n- **基准分支**: " + .baseRefName + " <- **源分支**: " + .headRefName +
          "\n- **变更文件数**: " + (.changedFiles | tostring) +
          "\n- **新增**: +" + (.additions | tostring) + " / **删除**: -" + (.deletions | tostring) +
          "\n\n## 总结\n\nAgent 已完成 PR 审查并发布评论，但没有返回完整报告块。请以 PR 评论区的最新审查评论为准。\n\n**结论**: 已审查\n\n!--------!\n\nPR: " + .url
        '"'"' >> "$OUTPUT_FILE" 2>/dev/null || true
      fi
    fi
  elif [ "$TASK_COMMAND" = "git-push" ]; then
    OPEN_URL=$(extract_first_markdown_url '^https://(github\\.com|gitlab\\.com)/[^[:space:]<>")}]+/commit/[0-9a-f]+$')
    if [ -z "$OPEN_URL" ]; then
      OPEN_URL=$(grep -oE 'https://(github\\.com|gitlab\\.com)/[^[:space:]<>")}]+/commit/[0-9a-f]+' "$OUTPUT_FILE" | head -1)
    fi
    if [ -z "$OPEN_URL" ]; then
      OPEN_URL=$(extract_first_markdown_url '^https://bitbucket\\.org/[^[:space:]<>")}]+/commits/[0-9a-f]+$')
    fi
    if [ -z "$OPEN_URL" ]; then
      OPEN_URL=$(grep -oE 'https://bitbucket\\.org/[^[:space:]<>")}]+/commits/[0-9a-f]+' "$OUTPUT_FILE" | head -1)
    fi
    if [ -z "$OPEN_URL" ]; then
      OPEN_URL=$(extract_last_markdown_url '^https://(github\\.com|gitlab\\.com|bitbucket\\.org)/[^[:space:]<>")}]+' )
    fi
    if [ -z "$OPEN_URL" ]; then
      OPEN_URL=$(grep -oE 'https://(github\\.com|gitlab\\.com|bitbucket\\.org)/[^[:space:]<>")}]+' "$OUTPUT_FILE" | tail -1 | sed "s/[.,;:)']*$//")
    fi
    if [ -z "$OPEN_URL" ]; then
      SSH_MATCH=$(grep -oE '(git@)?(github\\.com|gitlab\\.com|bitbucket\\.org):[^[:space:]]+' "$OUTPUT_FILE" | tail -1)
      if [ -n "$SSH_MATCH" ]; then
        SSH_HOST=$(echo "$SSH_MATCH" | sed 's/^git@//' | cut -d: -f1)
        SSH_PATH=$(echo "$SSH_MATCH" | cut -d: -f2 | sed 's/\\.git$//')
        OPEN_URL="https://$SSH_HOST/$SSH_PATH"
      fi
    fi
    if [ -z "$OPEN_URL" ]; then
      END_HEAD=$(git rev-parse HEAD 2>/dev/null || echo "")
      if [ -n "$END_HEAD" ] && [ "$END_HEAD" != "$START_HEAD" ]; then
        REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
        if [ -n "$REMOTE_URL" ]; then
          case "$REMOTE_URL" in
            https://*)
              REMOTE_BASE=$(echo "$REMOTE_URL" | sed 's/\\.git$//')
              ;;
            git@*)
              REMOTE_HOST=$(echo "$REMOTE_URL" | sed 's/^git@//' | cut -d: -f1)
              REMOTE_PATH=$(echo "$REMOTE_URL" | cut -d: -f2 | sed 's/\\.git$//')
              REMOTE_BASE="https://$REMOTE_HOST/$REMOTE_PATH"
              ;;
            *)
              REMOTE_BASE=""
              ;;
          esac
          if [ -n "$REMOTE_BASE" ]; then
            OPEN_URL="$REMOTE_BASE/commit/$END_HEAD"
            printf "\\nPushed successfully.\\n\\n\\\`\\\`\\\`text\\n%s\\n\\\`\\\`\\\`\\n" "$OPEN_URL" >> "$OUTPUT_FILE"
          fi
        fi
      fi
    fi
  fi

  # Replace base URL in OPEN_URL with actual git remote base URL
  if [ -n "$OPEN_URL" ] && [ "$TASK_COMMAND" != "review-pr" ]; then
    REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
    if [ -n "$REMOTE_URL" ]; then
      REMOTE_BASE=""
      case "$REMOTE_URL" in
        https://*)
          REMOTE_BASE=$(echo "$REMOTE_URL" | sed 's/\\.git$//' | grep -oE '^https://[^/]+/[^/]+/[^/]+')
          ;;
        git@*)
          REMOTE_HOST=$(echo "$REMOTE_URL" | sed 's/^git@//' | cut -d: -f1)
          REMOTE_PATH=$(echo "$REMOTE_URL" | cut -d: -f2 | sed 's/\\.git$//')
          REMOTE_BASE="https://$REMOTE_HOST/$REMOTE_PATH"
          ;;
      esac
      if [ -n "$REMOTE_BASE" ]; then
        URL_BASE=$(echo "$OPEN_URL" | grep -oE '^https://[^/]+/[^/]+/[^/]+')
        if [ -n "$URL_BASE" ] && [ "$URL_BASE" != "$REMOTE_BASE" ]; then
          OPEN_URL=$(echo "$OPEN_URL" | sed "s|$URL_BASE|$REMOTE_BASE|")
        fi
      fi
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

printf "%s\\n" "$EXIT_CODE" > ${JSON.stringify(exitCodeFile)}
printf "" > "$PID_FILE"

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
    child = spawn("/bin/bash", ["-c", script], {
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
