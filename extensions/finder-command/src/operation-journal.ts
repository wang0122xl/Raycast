import { LocalStorage, environment } from "@raycast/api";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { basename, dirname, join } from "path";

const OPERATION_LOG_KEY = "finder-command.operation-log";
const JOURNAL_DIR = "operation-journal";
const SNAPSHOT_DIR = "snapshots";

export type JournalAction =
  | {
      type: "restore";
      path: string;
      snapshotPath: string;
    }
  | {
      type: "remove";
      path: string;
      sourcePath?: string;
    };

export interface OperationLogEntry {
  id: string;
  tool: string;
  folderPath: string;
  summary: string;
  createdAt: string;
  reversible: boolean;
  actions: JournalAction[];
}

function journalRoot() {
  const root = join(environment.supportPath, JOURNAL_DIR);
  mkdirSync(root, { recursive: true });
  return root;
}

function resetJournalRoot() {
  rmSync(journalRoot(), { recursive: true, force: true });
  mkdirSync(journalRoot(), { recursive: true });
}

function operationRoot(operationId: string) {
  const root = join(journalRoot(), operationId);
  mkdirSync(root, { recursive: true });
  return root;
}

function logFilePath() {
  return join(journalRoot(), "operation-log.json");
}

function createOperationId(tool: string) {
  return `${Date.now()}-${tool}-${Math.random().toString(36).slice(2)}`;
}

function readLogFile(): OperationLogEntry | undefined {
  const path = logFilePath();
  if (!existsSync(path)) return undefined;

  try {
    return JSON.parse(readFileSync(path, "utf-8")) as OperationLogEntry;
  } catch {
    return undefined;
  }
}

async function readLatestOperation(): Promise<OperationLogEntry | undefined> {
  const localStorageLog = await LocalStorage.getItem<string>(OPERATION_LOG_KEY);
  if (localStorageLog) {
    try {
      return JSON.parse(localStorageLog) as OperationLogEntry;
    } catch {
      await LocalStorage.removeItem(OPERATION_LOG_KEY);
    }
  }

  return readLogFile();
}

async function writeLatestOperation(entry: OperationLogEntry) {
  const serialized = JSON.stringify(entry, null, 2);

  writeFileSync(logFilePath(), serialized);
  await LocalStorage.setItem(OPERATION_LOG_KEY, serialized);
}

export async function createJournalOperation(tool: string) {
  const currentEntry = await readLatestOperation();
  if (currentEntry?.reversible) {
    operationRoot(currentEntry.id);
    return currentEntry.id;
  }

  const id = createOperationId(tool);
  operationRoot(id);
  return id;
}

export async function beginNewUndoScope() {
  resetJournalRoot();
  await LocalStorage.removeItem(OPERATION_LOG_KEY);
}

export function cleanupJournalOperation(operationId: string) {
  rmSync(operationRoot(operationId), { recursive: true, force: true });
}

export function snapshotItems(input: {
  operationId: string;
  folderPath: string;
  paths: string[];
}): JournalAction[] {
  const snapshotRoot = join(operationRoot(input.operationId), SNAPSHOT_DIR);
  mkdirSync(snapshotRoot, { recursive: true });

  return input.paths.map((path, index) => {
    const snapshotPath = join(
      snapshotRoot,
      `${index}-${basename(path) || "item"}`,
    );

    cpSync(path, snapshotPath, {
      recursive: true,
      errorOnExist: true,
      force: false,
      preserveTimestamps: true,
    });

    return {
      type: "restore",
      path,
      snapshotPath,
    };
  });
}

export async function recordOperation(input: {
  operationId: string;
  tool: string;
  folderPath: string;
  summary: string;
  actions?: JournalAction[];
}) {
  const currentEntry = await readLatestOperation();

  if (currentEntry?.id === input.operationId) {
    const entry: OperationLogEntry = {
      ...currentEntry,
      tool: currentEntry.tool.includes(input.tool)
        ? currentEntry.tool
        : `${currentEntry.tool},${input.tool}`,
      summary: `${currentEntry.summary}; ${input.summary}`,
      reversible: currentEntry.reversible || (input.actions?.length ?? 0) > 0,
      actions: mergeActions(currentEntry.actions, input.actions ?? []),
    };
    await writeLatestOperation(entry);
    return entry;
  }

  const entry: OperationLogEntry = {
    id: input.operationId,
    tool: input.tool,
    folderPath: input.folderPath,
    summary: input.summary,
    createdAt: new Date().toISOString(),
    reversible: (input.actions?.length ?? 0) > 0,
    actions: input.actions ?? [],
  };
  await writeLatestOperation(entry);
  return entry;
}

function mergeActions(
  currentActions: JournalAction[],
  incomingActions: JournalAction[],
) {
  const mergedActions: JournalAction[] = [...currentActions];
  const createdPathIndexes = new Map<string, number>();
  const createdSourcePaths = new Set<string>();

  mergedActions.forEach((action, index) => {
    if (action.type === "remove") {
      createdPathIndexes.set(action.path, index);
    }
  });

  for (const incomingAction of incomingActions) {
    if (
      incomingAction.type === "restore" &&
      createdPathIndexes.has(incomingAction.path)
    ) {
      continue;
    }

    if (incomingAction.type === "remove" && incomingAction.sourcePath) {
      const createdPathIndex = createdPathIndexes.get(
        incomingAction.sourcePath,
      );

      if (createdPathIndex !== undefined) {
        mergedActions[createdPathIndex] = {
          ...incomingAction,
          sourcePath: undefined,
        };
        createdSourcePaths.add(incomingAction.sourcePath);
        createdPathIndexes.delete(incomingAction.sourcePath);
        createdPathIndexes.set(incomingAction.path, createdPathIndex);
        continue;
      }
    }

    if (
      incomingAction.type === "restore" &&
      createdSourcePaths.has(incomingAction.path)
    ) {
      continue;
    }

    mergedActions.push(incomingAction);
    if (incomingAction.type === "remove") {
      createdPathIndexes.set(incomingAction.path, mergedActions.length - 1);
    }
  }

  return mergedActions;
}

function restoreSnapshot(action: Extract<JournalAction, { type: "restore" }>) {
  if (!existsSync(action.snapshotPath)) {
    throw new Error(`Snapshot is missing: ${action.snapshotPath}`);
  }

  rmSync(action.path, { recursive: true, force: true });
  mkdirSync(dirname(action.path), { recursive: true });
  cpSync(action.snapshotPath, action.path, {
    recursive: true,
    errorOnExist: true,
    force: false,
    preserveTimestamps: true,
  });
}

function removeCreatedPath(action: Extract<JournalAction, { type: "remove" }>) {
  rmSync(action.path, { recursive: true, force: true });
}

export async function undoLastReversibleOperation() {
  const entry = await readLatestOperation();

  if (!entry?.reversible) {
    throw new Error("No reversible operation is available to undo.");
  }
  const removeActions = entry.actions.filter(
    (action) => action.type === "remove",
  );
  const restoreActions = entry.actions.filter(
    (action) => action.type === "restore",
  );

  for (const action of removeActions) {
    removeCreatedPath(action);
  }

  for (const action of restoreActions) {
    restoreSnapshot(action);
  }

  resetJournalRoot();
  await LocalStorage.removeItem(OPERATION_LOG_KEY);

  return entry;
}
