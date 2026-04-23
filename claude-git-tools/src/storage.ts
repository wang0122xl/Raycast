import { LocalStorage } from "@raycast/api";

const CONFIGURED_FOLDERS_KEY = "configured-folders";
const DIR_HISTORY_KEY = "dir-history";
const BRANCH_HISTORY_PREFIX = "branch-history:";
const TASKS_KEY = "tasks";
const CODE_AGENT_KEY = "code-agent";

export type CodeAgent = "claude" | "codex" | "opencode";

export interface Task {
  id: string;
  command: string;
  dir: string;
  label: string;
  branch?: string;
  targetBranch?: string;
  status: "running" | "completed" | "failed" | "stopped";
  outputFile: string;
  pidFile: string;
  exitCodeFile?: string;
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

export async function getCodeAgent(): Promise<CodeAgent> {
  const val = await LocalStorage.getItem<string>(CODE_AGENT_KEY);
  return (val as CodeAgent) || "claude";
}

export async function setCodeAgent(agent: CodeAgent) {
  await LocalStorage.setItem(CODE_AGENT_KEY, agent);
}

export async function getFolders(): Promise<string[]> {
  return getJsonArray(CONFIGURED_FOLDERS_KEY);
}

export async function addFolder(path: string) {
  const folders = await getFolders();
  if (!folders.includes(path)) {
    await setJsonArray(CONFIGURED_FOLDERS_KEY, [...folders, path]);
  }
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
