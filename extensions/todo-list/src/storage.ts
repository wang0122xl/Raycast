import { environment } from "@raycast/api";
import crypto from "crypto";
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
  preferences,
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

type EncryptedStorageRecord = {
  encrypted: true;
  version: 1;
  iv: string;
  tag: string;
  data: string;
};

type StoredEncryptedTodoItem = Omit<StoredTodoItem, "title" | "tag"> & {
  encryptedContent: EncryptedStorageRecord;
};

type StoredEncryptedTodoEvent =
  | {
      type: "upsert";
      item: StoredEncryptedTodoItem;
      timestamp: number;
    }
  | {
      type: "hard-delete";
      id: string;
      timestamp: number;
    };

export type TodoStorageState = {
  current: TodoSections;
  searchable: TodoSections;
};

const ENCRYPTION_SALT = "raycast-todo-list-storage-v1";
const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const TODO_ENCRYPTION_KEY_FILE = path.join(environment.supportPath, "todo-encryption-key");

let cachedSecret: string | undefined;
let cachedEncryptionKey: Buffer | undefined;
let todoStorageError: string | undefined;

const cloneDefaultSections = (): TodoSections => ({
  pinned: [],
  todo: [],
  completed: [],
});

export function getTodoStorageAvailability() {
  return {
    isAvailable: todoStorageError === undefined,
    message: todoStorageError,
  };
}

function markTodoStorageAvailable() {
  todoStorageError = undefined;
}

function handleTodoStorageError(error: unknown) {
  todoStorageError = error instanceof Error ? error.message : "Unable to read encrypted todo storage.";
}

function getTodoEncryptionSecret() {
  const encryptionKey =
    readStoredTodoEncryptionSecret() ?? (preferences as Preferences & { encryptionKey?: string }).encryptionKey?.trim();
  if (!encryptionKey) {
    throw new Error(
      "Todo encryption key is required. Set it from the Todo List prompt or Raycast extension preferences.",
    );
  }
  return encryptionKey;
}

function readStoredTodoEncryptionSecret() {
  try {
    const encryptionKey = fs.readFileSync(TODO_ENCRYPTION_KEY_FILE, "utf8").trim();
    return encryptionKey.length > 0 ? encryptionKey : undefined;
  } catch {
    return undefined;
  }
}

export function saveTodoEncryptionSecret(encryptionKey: string) {
  const trimmedEncryptionKey = encryptionKey.trim();
  if (!trimmedEncryptionKey) {
    throw new Error("Todo encryption key cannot be empty.");
  }

  fs.mkdirSync(environment.supportPath, { recursive: true });
  const tempPath = `${TODO_ENCRYPTION_KEY_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${trimmedEncryptionKey}\n`, { mode: 0o600 });
  fs.renameSync(tempPath, TODO_ENCRYPTION_KEY_FILE);
  cachedSecret = undefined;
  cachedEncryptionKey = undefined;
}

function getTodoEncryptionKey() {
  const secret = getTodoEncryptionSecret();
  if (!cachedEncryptionKey || cachedSecret !== secret) {
    cachedSecret = secret;
    cachedEncryptionKey = crypto.scryptSync(secret, ENCRYPTION_SALT, 32);
  }
  return cachedEncryptionKey;
}

function isEncryptedStorageRecord(record: unknown): record is EncryptedStorageRecord {
  return (
    typeof record === "object" &&
    record !== null &&
    (record as EncryptedStorageRecord).encrypted === true &&
    (record as EncryptedStorageRecord).version === 1 &&
    typeof (record as EncryptedStorageRecord).iv === "string" &&
    typeof (record as EncryptedStorageRecord).tag === "string" &&
    typeof (record as EncryptedStorageRecord).data === "string"
  );
}

function encryptStorageRecord<T>(record: T): EncryptedStorageRecord {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, getTodoEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(record), "utf8"), cipher.final()]);

  return {
    encrypted: true,
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64"),
  };
}

function decryptStorageRecord<T>(record: EncryptedStorageRecord): T {
  const decipher = crypto.createDecipheriv(
    ENCRYPTION_ALGORITHM,
    getTodoEncryptionKey(),
    Buffer.from(record.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(record.tag, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(record.data, "base64")), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8")) as T;
}

function decodeStorageRecord<T>(record: unknown): T {
  if (isEncryptedStorageRecord(record)) {
    return decryptStorageRecord<T>(record);
  }
  return record as T;
}

function encodeTodoItem(item: StoredTodoItem): StoredEncryptedTodoItem {
  const { title, tag, ...metadata } = item;
  return {
    ...metadata,
    encryptedContent: encryptStorageRecord({ title, tag }),
  };
}

function decodeTodoItem(item: StoredTodoItem | StoredEncryptedTodoItem): StoredTodoItem {
  if ("encryptedContent" in item) {
    const { encryptedContent, ...metadata } = item;
    const content = decryptStorageRecord<Pick<TodoItem, "title" | "tag">>(encryptedContent);
    return {
      ...metadata,
      ...content,
    };
  }
  return item;
}

function encodeTodoEvent(event: TodoEvent): StoredEncryptedTodoEvent {
  if (event.type === "hard-delete") return event;

  return {
    ...event,
    item: encodeTodoItem(event.item),
  };
}

function decodeTodoEvent(event: TodoEvent | StoredEncryptedTodoEvent): TodoEvent {
  if (event.type === "hard-delete") return event;

  return {
    ...event,
    item: decodeTodoItem(event.item),
  };
}

function isEncodedTodoItem(record: unknown): record is StoredEncryptedTodoItem {
  return (
    typeof record === "object" &&
    record !== null &&
    isEncryptedStorageRecord((record as StoredEncryptedTodoItem).encryptedContent)
  );
}

function isEncodedTodoEvent(record: unknown): record is StoredEncryptedTodoEvent {
  if (typeof record !== "object" || record === null) return false;
  const event = record as StoredEncryptedTodoEvent;
  return event.type === "hard-delete" || (event.type === "upsert" && isEncodedTodoItem(event.item));
}

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
  return `todo-${item.timeAdded}-${section}-${index}`;
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
  if (!fs.existsSync(filePath)) return [];

  try {
    return fs
      .readFileSync(filePath, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => decodeStorageRecord<T>(JSON.parse(line) as unknown));
  } catch {
    throw new Error(
      `Unable to read encrypted todo storage file: ${filePath}. Check the Todo Encryption Key preference.`,
    );
  }
}

function writeNdjson<T>(filePath: string, records: T[], encodeRecord: (record: T) => unknown) {
  const contents = records.map((record) => JSON.stringify(encodeRecord(record))).join("\n");
  writeFileAtomic(filePath, contents.length > 0 ? `${contents}\n` : "");
}

function readJsonStorageFile<T>(filePath: string): T {
  return decodeStorageRecord<T>(JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown);
}

function writeJsonStorageFile<T>(filePath: string, record: T) {
  writeFileAtomic(filePath, `${JSON.stringify(encryptStorageRecord(record))}\n`);
}

function appendEvent(event: TodoEvent, manifest: TodoManifest) {
  let activePath = eventFilePath(manifest.activeEventFile);
  if (fs.existsSync(activePath) && fs.statSync(activePath).size > manifest.maxEventFileBytes) {
    manifest.activeEventFile = eventFileName(manifest.nextEventIndex);
    manifest.nextEventIndex += 1;
    writeManifest(manifest);
    activePath = eventFilePath(manifest.activeEventFile);
  }
  fs.appendFileSync(activePath, `${JSON.stringify(encodeTodoEvent(event))}\n`);
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
    parseNdjson<TodoEvent | StoredEncryptedTodoEvent>(eventFilePath(fileName)).forEach((storedEvent) => {
      const event = decodeTodoEvent(storedEvent);
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
  parseNdjson<StoredTodoItem | StoredEncryptedTodoItem>(TODO_CURRENT_FILE).forEach((storedItem, index) => {
    const item = decodeTodoItem(storedItem);
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
    const storedItems = readJsonStorageFile<TodoSections | [TodoItem[], TodoItem[]]>(TODO_FILE);
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
  writeNdjson(TODO_CURRENT_FILE, flattenSections(sections), encodeTodoItem);
}

function rewriteCurrentFileIfNeeded() {
  if (!fs.existsSync(TODO_CURRENT_FILE)) return;

  const records = fs
    .readFileSync(TODO_CURRENT_FILE, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);

  if (records.every(isEncodedTodoItem)) return;

  writeNdjson(
    TODO_CURRENT_FILE,
    records.map((record) => decodeTodoItem(decodeStorageRecord<StoredTodoItem | StoredEncryptedTodoItem>(record))),
    encodeTodoItem,
  );
}

function rewriteEventFileIfNeeded(filePath: string) {
  if (!fs.existsSync(filePath)) return;

  const records = fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);

  if (records.every(isEncodedTodoEvent)) return;

  writeNdjson(
    filePath,
    records.map((record) => decodeTodoEvent(decodeStorageRecord<TodoEvent | StoredEncryptedTodoEvent>(record))),
    encodeTodoEvent,
  );
}

function encryptExistingStorageIfNeeded() {
  if (fs.existsSync(TODO_FILE)) {
    const storedItems = JSON.parse(fs.readFileSync(TODO_FILE, "utf8")) as unknown;
    if (!isEncryptedStorageRecord(storedItems)) {
      writeJsonStorageFile(TODO_FILE, storedItems);
    }
  }
  rewriteCurrentFileIfNeeded();
  listEventFiles().forEach((fileName) => {
    rewriteEventFileIfNeeded(eventFilePath(fileName));
  });
}

export function loadTodoState(): TodoStorageState {
  try {
    ensureSupportPath();
    const manifest = getManifest();
    backfillEventsFromCurrentIfNeeded(manifest);
    migrateLegacyJsonIfNeeded(manifest);
    encryptExistingStorageIfNeeded();

    const searchable = replayEvents();
    const currentFromEvents = currentSectionsFromSearchable(searchable);
    writeCurrent(currentFromEvents);
    markTodoStorageAvailable();

    return {
      current: currentFromEvents,
      searchable,
    };
  } catch (error) {
    handleTodoStorageError(error);
    return {
      current: cloneDefaultSections(),
      searchable: cloneDefaultSections(),
    };
  }
}

export function loadCurrentTodoSections(): TodoSections {
  try {
    ensureSupportPath();
    const manifest = getManifest();
    backfillEventsFromCurrentIfNeeded(manifest);
    migrateLegacyJsonIfNeeded(manifest);
    encryptExistingStorageIfNeeded();

    if (!fs.existsSync(TODO_CURRENT_FILE)) {
      return loadTodoState().current;
    }

    const current = currentSectionsFromRecords(
      parseNdjson<StoredTodoItem | StoredEncryptedTodoItem>(TODO_CURRENT_FILE).map(decodeTodoItem),
    );
    writeCurrent(current);
    markTodoStorageAvailable();
    return current;
  } catch (error) {
    handleTodoStorageError(error);
    return cloneDefaultSections();
  }
}

export function loadSearchableTodoSections(): TodoSections {
  try {
    ensureSupportPath();
    const manifest = getManifest();
    backfillEventsFromCurrentIfNeeded(manifest);
    migrateLegacyJsonIfNeeded(manifest);
    encryptExistingStorageIfNeeded();
    const searchable = replayEvents();
    markTodoStorageAvailable();
    return searchable;
  } catch (error) {
    handleTodoStorageError(error);
    return cloneDefaultSections();
  }
}

function byId(records: StoredTodoItem[]) {
  return new Map(records.map((record) => [record.id, record]));
}

function hasRecordChanged(previousItem: StoredTodoItem | undefined, nextItem: StoredTodoItem) {
  if (!previousItem) return true;
  return recordsDiffer(previousItem, nextItem);
}

export function saveTodoSections(previousCurrent: TodoSections, nextCurrent: TodoSections) {
  try {
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
    markTodoStorageAvailable();
    return current;
  } catch (error) {
    handleTodoStorageError(error);
    return previousCurrent;
  }
}
