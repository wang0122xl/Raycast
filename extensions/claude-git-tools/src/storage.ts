import { LocalStorage } from "@raycast/api";

const CONFIGURED_FOLDERS_KEY = "configured-folders";
const DIR_HISTORY_KEY = "dir-history";
const HIDDEN_REPOS_KEY = "hidden-repos";
const BRANCH_HISTORY_PREFIX = "branch-history:";
const TASKS_KEY = "tasks";
const MODEL_KEY = "selected-model";
const CODEX_MODEL_KEY = "selected-codex-model";
const GEMINI_MODEL_KEY = "selected-gemini-model";
const MODEL_COMMAND_KEY = "selected-model-command";
const COMMAND_MODEL_PREFIX = "selected-model:";
const AGENT_KEY = "selected-agent";
const COMMAND_AGENT_PREFIX = "selected-agent:";
const SKILL_PREFIX = "skill-";

export type ClaudeModel = "haiku" | "sonnet" | "opus";
export const DEFAULT_MODEL: ClaudeModel = "sonnet";

export type CodexModel = "gpt-5.5" | "gpt-5.4" | "gpt-5.3-codex";
export const DEFAULT_CODEX_MODEL: CodexModel = "gpt-5.5";

export type GeminiModel =
  | "gemini-3.1-pro-preview"
  | "gemini-3-flash-preview"
  | "gemini-3.1-flash-lite-preview";
export const DEFAULT_GEMINI_MODEL: GeminiModel = "gemini-3.1-pro-preview";

export type OpenCodeModel = string;
export const DEFAULT_OPENCODE_MODEL: OpenCodeModel = "";

export type Agent = "claude" | "codex" | "opencode" | "gemini";
export const DEFAULT_AGENT: Agent = "claude";

export type SkillCommand = "git-push" | "create-pr" | "review-pr";
export const DEFAULT_MODEL_COMMAND: SkillCommand = "git-push";

export interface Task {
  id: string;
  command: string;
  dir: string;
  label: string;
  branch?: string;
  targetBranch?: string;
  prUrl?: string;
  status: "running" | "completed" | "failed" | "stopped" | "canceled";
  outputFile: string;
  pidFile: string;
  exitCodeFile?: string;
  commandLine?: string;
  agent?: Agent;
  startTime: number;
}

async function getJsonArray<T = string>(key: string): Promise<T[]> {
  const raw = await LocalStorage.getItem<string>(key);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function setJsonArray<T>(key: string, arr: T[]) {
  await LocalStorage.setItem(key, JSON.stringify(arr));
}

function isPathInFolder(path: string, folder: string) {
  const normalizedPath = path.replace(/\/+$/, "");
  const normalizedFolder = folder.replace(/\/+$/, "");
  return (
    normalizedPath === normalizedFolder ||
    normalizedPath.startsWith(`${normalizedFolder}/`)
  );
}

export async function getFolders(): Promise<string[]> {
  return getJsonArray(CONFIGURED_FOLDERS_KEY);
}

export async function addFolder(path: string) {
  const folders = await getFolders();
  if (!folders.includes(path)) {
    await setJsonArray(CONFIGURED_FOLDERS_KEY, [...folders, path]);
  }
  await unhideReposUnderFolder(path);
}

export async function removeFolder(path: string) {
  const folders = await getFolders();
  await setJsonArray(
    CONFIGURED_FOLDERS_KEY,
    folders.filter((f) => f !== path),
  );
}

export async function getDirHistory(): Promise<string[]> {
  return getJsonArray(DIR_HISTORY_KEY);
}

export async function addDirHistory(dir: string) {
  const history = await getDirHistory();
  const updated = [dir, ...history.filter((d) => d !== dir)].slice(0, 20);
  await setJsonArray(DIR_HISTORY_KEY, updated);
}

export async function removeDirHistory(dir: string) {
  const history = await getDirHistory();
  await setJsonArray(
    DIR_HISTORY_KEY,
    history.filter((d) => d !== dir),
  );
}

export async function getHiddenRepos(): Promise<string[]> {
  return getJsonArray(HIDDEN_REPOS_KEY);
}

export async function hideRepo(dir: string) {
  const [hiddenRepos, history] = await Promise.all([
    getHiddenRepos(),
    getDirHistory(),
  ]);
  if (!hiddenRepos.includes(dir)) {
    await setJsonArray(HIDDEN_REPOS_KEY, [...hiddenRepos, dir]);
  }
  await setJsonArray(
    DIR_HISTORY_KEY,
    history.filter((d) => d !== dir),
  );
}

async function unhideReposUnderFolder(folder: string) {
  const hiddenRepos = await getHiddenRepos();
  await setJsonArray(
    HIDDEN_REPOS_KEY,
    hiddenRepos.filter((repo) => !isPathInFolder(repo, folder)),
  );
}

export async function getBranchHistory(dirPath: string): Promise<string[]> {
  return getJsonArray(BRANCH_HISTORY_PREFIX + dirPath);
}

export async function addBranchHistory(dirPath: string, branch: string) {
  const history = await getBranchHistory(dirPath);
  const updated = [branch, ...history.filter((b) => b !== branch)].slice(0, 20);
  await setJsonArray(BRANCH_HISTORY_PREFIX + dirPath, updated);
}

export async function removeBranchHistory(dirPath: string, branch: string) {
  const history = await getBranchHistory(dirPath);
  await setJsonArray(
    BRANCH_HISTORY_PREFIX + dirPath,
    history.filter((b) => b !== branch),
  );
}

export async function getTasks(): Promise<Task[]> {
  return getJsonArray<Task>(TASKS_KEY);
}

export async function addTask(task: Task) {
  const tasks = await getTasks();
  await setJsonArray(TASKS_KEY, [task, ...tasks]);
}

export async function updateTask(id: string, updates: Partial<Task>) {
  const tasks = await getTasks();
  await setJsonArray(
    TASKS_KEY,
    tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
  );
}

export async function removeTask(id: string) {
  const tasks = await getTasks();
  await setJsonArray(
    TASKS_KEY,
    tasks.filter((t) => t.id !== id),
  );
}

export async function getModel(): Promise<ClaudeModel> {
  const raw = await LocalStorage.getItem<string>(MODEL_KEY);
  if (raw === "haiku" || raw === "sonnet" || raw === "opus") return raw;
  return DEFAULT_MODEL;
}

export async function setModel(model: ClaudeModel) {
  await LocalStorage.setItem(MODEL_KEY, model);
}

export async function getCodexModel(): Promise<CodexModel> {
  const raw = await LocalStorage.getItem<string>(CODEX_MODEL_KEY);
  if (raw === "gpt-5.5" || raw === "gpt-5.4" || raw === "gpt-5.3-codex") {
    return raw;
  }
  return DEFAULT_CODEX_MODEL;
}

export async function setCodexModel(model: CodexModel) {
  await LocalStorage.setItem(CODEX_MODEL_KEY, model);
}

export async function getGeminiModel(): Promise<GeminiModel> {
  const raw = await LocalStorage.getItem<string>(GEMINI_MODEL_KEY);
  if (
    raw === "gemini-3.1-pro-preview" ||
    raw === "gemini-3-flash-preview" ||
    raw === "gemini-3.1-flash-lite-preview"
  ) {
    return raw;
  }
  return DEFAULT_GEMINI_MODEL;
}

export async function setGeminiModel(model: GeminiModel) {
  await LocalStorage.setItem(GEMINI_MODEL_KEY, model);
}

function commandModelKey(command: SkillCommand, agent: Agent): string {
  return `${COMMAND_MODEL_PREFIX}${command}:${agent}`;
}

function isSkillCommand(value: string | undefined): value is SkillCommand {
  return value === "git-push" || value === "create-pr" || value === "review-pr";
}

export async function getModelCommand(): Promise<SkillCommand> {
  const raw = await LocalStorage.getItem<string>(MODEL_COMMAND_KEY);
  return isSkillCommand(raw) ? raw : DEFAULT_MODEL_COMMAND;
}

export async function setModelCommand(command: SkillCommand): Promise<void> {
  await LocalStorage.setItem(MODEL_COMMAND_KEY, command);
}

export async function getClaudeModelForCommand(
  command: SkillCommand,
): Promise<ClaudeModel> {
  const raw = await LocalStorage.getItem<string>(
    commandModelKey(command, "claude"),
  );
  if (raw === "haiku" || raw === "sonnet" || raw === "opus") return raw;
  return DEFAULT_MODEL;
}

export async function setClaudeModelForCommand(
  command: SkillCommand,
  model: ClaudeModel,
): Promise<void> {
  await LocalStorage.setItem(commandModelKey(command, "claude"), model);
}

export async function getCodexModelForCommand(
  command: SkillCommand,
): Promise<CodexModel> {
  const raw = await LocalStorage.getItem<string>(
    commandModelKey(command, "codex"),
  );
  if (raw === "gpt-5.5" || raw === "gpt-5.4" || raw === "gpt-5.3-codex") {
    return raw;
  }
  return DEFAULT_CODEX_MODEL;
}

export async function setCodexModelForCommand(
  command: SkillCommand,
  model: CodexModel,
): Promise<void> {
  await LocalStorage.setItem(commandModelKey(command, "codex"), model);
}

export async function getGeminiModelForCommand(
  command: SkillCommand,
): Promise<GeminiModel> {
  const raw = await LocalStorage.getItem<string>(
    commandModelKey(command, "gemini"),
  );
  if (
    raw === "gemini-3.1-pro-preview" ||
    raw === "gemini-3-flash-preview" ||
    raw === "gemini-3.1-flash-lite-preview"
  ) {
    return raw;
  }
  return DEFAULT_GEMINI_MODEL;
}

export async function setGeminiModelForCommand(
  command: SkillCommand,
  model: GeminiModel,
): Promise<void> {
  await LocalStorage.setItem(commandModelKey(command, "gemini"), model);
}

export async function getOpenCodeModelForCommand(
  command: SkillCommand,
): Promise<OpenCodeModel> {
  const raw = await LocalStorage.getItem<string>(
    commandModelKey(command, "opencode"),
  );
  return raw?.trim() || DEFAULT_OPENCODE_MODEL;
}

export async function setOpenCodeModelForCommand(
  command: SkillCommand,
  model: OpenCodeModel,
): Promise<void> {
  await LocalStorage.setItem(
    commandModelKey(command, "opencode"),
    model.trim(),
  );
}

export async function getAgent(): Promise<Agent> {
  const raw = await LocalStorage.getItem<string>(AGENT_KEY);
  if (
    raw === "claude" ||
    raw === "codex" ||
    raw === "opencode" ||
    raw === "gemini"
  ) {
    return raw;
  }
  return DEFAULT_AGENT;
}

export async function setAgent(agent: Agent) {
  await LocalStorage.setItem(AGENT_KEY, agent);
}

function commandAgentKey(command: SkillCommand): string {
  return `${COMMAND_AGENT_PREFIX}${command}`;
}

export async function getAgentForCommand(
  command: SkillCommand,
): Promise<Agent> {
  const raw = await LocalStorage.getItem<string>(commandAgentKey(command));
  if (
    raw === "claude" ||
    raw === "codex" ||
    raw === "opencode" ||
    raw === "gemini"
  ) {
    return raw;
  }
  return DEFAULT_AGENT;
}

export async function setAgentForCommand(
  command: SkillCommand,
  agent: Agent,
): Promise<void> {
  await LocalStorage.setItem(commandAgentKey(command), agent);
}

export async function getSkillPath(
  command: SkillCommand,
): Promise<string | null> {
  const raw = await LocalStorage.getItem<string>(SKILL_PREFIX + command);
  return raw || null;
}

export async function setSkillPath(
  command: SkillCommand,
  path: string,
): Promise<void> {
  await LocalStorage.setItem(SKILL_PREFIX + command, path);
}

export async function removeSkillPath(command: SkillCommand): Promise<void> {
  await LocalStorage.removeItem(SKILL_PREFIX + command);
}
