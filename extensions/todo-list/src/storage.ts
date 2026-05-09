import { environment } from "@raycast/api";
import fs from "fs";
import path from "path";
import {
  COMPLETED_VISIBLE_DAYS,
  TODO_CURRENT_FILE,
  TODO_EVENTS_EXTENSION,
  TODO_EVENTS_MAX_BYTES,
  TODO_EVENTS_PREFIX,
  TODO_FILE,
  TODO_MANIFEST_FILE,
  TODO_STORAGE_PATH,
} from "./config";
import type { TodoItem, TodoSections } from "./atoms";

type TodoSectionKey = keyof TodoSections;

type StoredTodoItem = TodoItem & {
  id: string;
  section: TodoSectionKey;
  updatedAt: number;
};

type TodoEvent =
  | {
      type: "upsert";
      item: StoredTodoItem;
      timestamp: number;
    }
  | {
      type: "hard-delete";
      id: string;
      timestamp: number;
    };

type TodoManifest = {
  version: 1;
  activeEventFile: string;
  nextEventIndex: number;
  maxEventFileBytes: number;
  migratedFromLegacyJson?: boolean;
};

export type TodoStorageState = {
  current: TodoSections;
  searchable: TodoSections;
};

const cloneDefaultSections = (): TodoSections => ({
  pinned: [],
  todo: [],
  completed: [],
});

function ensureSupportPath() {
  fs.mkdirSync(TODO_STORAGE_PATH, { recursive: true });
  migrateStoragePathIfNeeded();
}

function writeFileAtomic(filePath: string, contents: string) {
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, contents);
  fs.renameSync(tempPath, filePath);
}

function eventFileName(index: number) {
  return `${TODO_EVENTS_PREFIX}${String(index).padStart(6, "0")}${TODO_EVENTS_EXTENSION}`;
}

function eventFilePath(fileName: string) {
  return path.join(TODO_STORAGE_PATH, fileName);
}

function oldSupportFilePath(fileName: string) {
  return path.join(environment.supportPath, fileName);
}

function hasStorageFiles(storagePath: string) {
  try {
    return fs
      .readdirSync(storagePath)
      .some(
        (file) =>
          file === "todo.json" ||
          file === "todo-manifest.json" ||
          file === "todo-current.ndjson" ||
          (file.startsWith(TODO_EVENTS_PREFIX) && file.endsWith(TODO_EVENTS_EXTENSION)),
      );
  } catch {
    return false;
  }
}

function migrateStoragePathIfNeeded() {
  if (hasStorageFiles(TODO_STORAGE_PATH) || !hasStorageFiles(environment.supportPath)) return;

  const filesToCopy = ["todo.json", "todo-manifest.json", "todo-current.ndjson"];
  try {
    for (const fileName of fs.readdirSync(environment.supportPath)) {
      if (fileName.startsWith(TODO_EVENTS_PREFIX) && fileName.endsWith(TODO_EVENTS_EXTENSION)) {
        filesToCopy.push(fileName);
      }
    }
  } catch {
    // Missing old support path is handled by the hasStorageFiles guard above.
  }

  filesToCopy.forEach((fileName) => {
    const source = oldSupportFilePath(fileName);
    const destination = path.join(TODO_STORAGE_PATH, fileName);
    if (fs.existsSync(source) && !fs.existsSync(destination)) {
      fs.copyFileSync(source, destination);
    }
  });
}

function createId(item: Pick<TodoItem, "timeAdded" | "title">, section: TodoSectionKey, index: number) {
  const normalizedTitle = item.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `todo-${item.timeAdded}-${section}-${index}-${normalizedTitle || "item"}`;
}

function readManifest(): TodoManifest | undefined {
  try {
    return JSON.parse(fs.readFileSync(TODO_MANIFEST_FILE, "utf8")) as TodoManifest;
  } catch {
    return undefined;
  }
}

function writeManifest(manifest: TodoManifest) {
  writeFileAtomic(TODO_MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
}

function createManifest(): TodoManifest {
  const manifest: TodoManifest = {
    version: 1,
    activeEventFile: eventFileName(1),
    nextEventIndex: 2,
    maxEventFileBytes: TODO_EVENTS_MAX_BYTES,
  };
  writeManifest(manifest);
  return manifest;
}

function getManifest(): TodoManifest {
  return readManifest() ?? createManifest();
}

function parseNdjson<T>(filePath: string): T[] {
  try {
    return fs
      .readFileSync(filePath, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  } catch {
    return [];
  }
}

function writeNdjson<T>(filePath: string, records: T[]) {
  const contents = records.map((record) => JSON.stringify(record)).join("\n");
  writeFileAtomic(filePath, contents.length > 0 ? `${contents}\n` : "");
}

function appendEvent(event: TodoEvent, manifest: TodoManifest) {
  let activePath = eventFilePath(manifest.activeEventFile);
  if (fs.existsSync(activePath) && fs.statSync(activePath).size > manifest.maxEventFileBytes) {
    manifest.activeEventFile = eventFileName(manifest.nextEventIndex);
    manifest.nextEventIndex += 1;
    writeManifest(manifest);
    activePath = eventFilePath(manifest.activeEventFile);
  }
  fs.appendFileSync(activePath, `${JSON.stringify(event)}\n`);
}

function listEventFiles() {
  try {
    return fs
      .readdirSync(TODO_STORAGE_PATH)
      .filter((file) => file.startsWith(TODO_EVENTS_PREFIX) && file.endsWith(TODO_EVENTS_EXTENSION))
      .sort();
  } catch {
    return [];
  }
}

function normalizeItem(item: TodoItem, section: TodoSectionKey, index: number, now = Date.now()): StoredTodoItem {
  const itemWithMaybeId = item as TodoItem & { id?: string; section?: TodoSectionKey; updatedAt?: number };
  return {
    ...item,
    id: itemWithMaybeId.id ?? createId(item, section, index),
    section,
    updatedAt: itemWithMaybeId.updatedAt ?? now,
    completedAt: item.completed ? (item.completedAt ?? item.timeAdded) : undefined,
  };
}

function flattenSections(sections: TodoSections, now = Date.now()) {
  const records: StoredTodoItem[] = [];
  (Object.keys(sections) as TodoSectionKey[]).forEach((sectionKey) => {
    sections[sectionKey].forEach((item, index) => {
      records.push(normalizeItem(item, sectionKey, index, now));
    });
  });
  return records;
}

function sectionsFromRecords(records: StoredTodoItem[]): TodoSections {
  const sections = cloneDefaultSections();
  records.forEach((record) => {
    if (record.section === "pinned") {
      sections.pinned.push(record);
      return;
    }
    if (record.completed) {
      sections.completed.push(record);
      return;
    }
    sections.todo.push(record);
  });
  return sections;
}

function isVisibleInMainList(item: StoredTodoItem) {
  if (item.deletedAt) return false;
  if (!item.completed) return true;

  const completedAt = item.completedAt ?? item.timeAdded;
  return completedAt >= Date.now() - COMPLETED_VISIBLE_DAYS * 24 * 60 * 60 * 1000;
}

function currentSectionsFromSearchable(searchable: TodoSections) {
  return sectionsFromRecords(flattenSections(searchable).filter(isVisibleInMainList));
}

function currentSectionsFromRecords(records: StoredTodoItem[]) {
  return sectionsFromRecords(records.filter(isVisibleInMainList));
}

function replayEvents(): TodoSections {
  const recordsById = new Map<string, StoredTodoItem>();
  listEventFiles().forEach((fileName) => {
    parseNdjson<TodoEvent>(eventFilePath(fileName)).forEach((event) => {
      if (event.type === "hard-delete") {
        recordsById.delete(event.id);
      } else {
        recordsById.set(event.item.id, event.item);
      }
    });
  });
  return sectionsFromRecords([...recordsById.values()]);
}

function recordsDiffer(previousItem: StoredTodoItem, nextItem: StoredTodoItem) {
  return (
    JSON.stringify({ ...previousItem, updatedAt: undefined }) !== JSON.stringify({ ...nextItem, updatedAt: undefined })
  );
}

function backfillEventsFromCurrentIfNeeded(manifest: TodoManifest) {
  if (!fs.existsSync(TODO_CURRENT_FILE)) return;

  const now = Date.now();
  const eventsById = byId(flattenSections(replayEvents()));
  parseNdjson<StoredTodoItem>(TODO_CURRENT_FILE).forEach((item, index) => {
    const normalizedItem = normalizeItem(item, item.section, index, now);
    const eventItem = eventsById.get(normalizedItem.id);
    if (!eventItem || recordsDiffer(eventItem, normalizedItem)) {
      appendEvent({ type: "upsert", item: normalizedItem, timestamp: now }, manifest);
    }
  });
}

function migrateLegacyJsonIfNeeded(manifest: TodoManifest) {
  if (manifest.migratedFromLegacyJson || listEventFiles().length > 0) return;

  let legacySections: TodoSections = cloneDefaultSections();
  try {
    const storedItems = JSON.parse(fs.readFileSync(TODO_FILE, "utf8"));
    if (Array.isArray(storedItems)) {
      const pinned = storedItems[0] ?? [];
      const todo: TodoItem[] = [];
      const completed: TodoItem[] = [];
      for (const item of storedItems[1] ?? []) {
        if (item.completed) completed.push(item);
        else todo.push(item);
      }
      legacySections = { pinned, todo, completed };
    } else {
      legacySections = {
        pinned: storedItems.pinned ?? [],
        todo: storedItems.todo ?? [],
        completed: storedItems.completed ?? [],
      };
    }
  } catch {
    legacySections = cloneDefaultSections();
  }

  const now = Date.now();
  flattenSections(legacySections, now).forEach((item) => {
    appendEvent({ type: "upsert", item, timestamp: now }, manifest);
  });
  manifest.migratedFromLegacyJson = true;
  writeManifest(manifest);
}

function writeCurrent(sections: TodoSections) {
  writeNdjson(TODO_CURRENT_FILE, flattenSections(sections));
}

export function loadTodoState(): TodoStorageState {
  ensureSupportPath();
  const manifest = getManifest();
  backfillEventsFromCurrentIfNeeded(manifest);
  migrateLegacyJsonIfNeeded(manifest);

  const searchable = replayEvents();
  const currentFromEvents = currentSectionsFromSearchable(searchable);
  writeCurrent(currentFromEvents);

  return {
    current: currentFromEvents,
    searchable,
  };
}

export function loadCurrentTodoSections(): TodoSections {
  ensureSupportPath();
  const manifest = getManifest();
  backfillEventsFromCurrentIfNeeded(manifest);
  migrateLegacyJsonIfNeeded(manifest);

  if (!fs.existsSync(TODO_CURRENT_FILE)) {
    return loadTodoState().current;
  }

  const current = currentSectionsFromRecords(parseNdjson<StoredTodoItem>(TODO_CURRENT_FILE));
  writeCurrent(current);
  return current;
}

export function loadSearchableTodoSections(): TodoSections {
  ensureSupportPath();
  const manifest = getManifest();
  backfillEventsFromCurrentIfNeeded(manifest);
  migrateLegacyJsonIfNeeded(manifest);
  return replayEvents();
}

function byId(records: StoredTodoItem[]) {
  return new Map(records.map((record) => [record.id, record]));
}

function hasRecordChanged(previousItem: StoredTodoItem | undefined, nextItem: StoredTodoItem) {
  if (!previousItem) return true;
  return recordsDiffer(previousItem, nextItem);
}

export function saveTodoSections(previousCurrent: TodoSections, nextCurrent: TodoSections) {
  ensureSupportPath();
  const manifest = getManifest();
  const now = Date.now();
  const previousCurrentById = byId(flattenSections(previousCurrent));
  const nextCurrentRecords = flattenSections(nextCurrent, now);
  const nextCurrentById = byId(nextCurrentRecords);

  previousCurrentById.forEach((previousItem, id) => {
    if (nextCurrentById.has(id)) return;

    if (previousItem.completed) {
      const softDeletedItem: StoredTodoItem = {
        ...previousItem,
        deletedAt: now,
        updatedAt: now,
      };
      appendEvent({ type: "upsert", item: softDeletedItem, timestamp: now }, manifest);
    } else {
      appendEvent({ type: "hard-delete", id, timestamp: now }, manifest);
    }
  });

  nextCurrentRecords.forEach((item) => {
    const previousItem = previousCurrentById.get(item.id);
    const normalizedItem: StoredTodoItem = {
      ...item,
      updatedAt: now,
      completedAt: item.completed ? (item.completedAt ?? previousItem?.completedAt ?? now) : undefined,
      deletedAt: undefined,
    };
    if (hasRecordChanged(previousItem, normalizedItem)) {
      appendEvent({ type: "upsert", item: normalizedItem, timestamp: now }, manifest);
    }
  });

  const current = currentSectionsFromRecords(nextCurrentRecords);
  writeCurrent(current);
  return current;
}
