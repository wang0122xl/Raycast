import { LocalStorage } from "@raycast/api";
import { existsSync, lstatSync } from "fs";
import { resolve } from "path";

const PROJECT_FOLDERS_KEY = "project-folders";

async function getJsonArray<T = string>(key: string): Promise<T[]> {
  const raw = await LocalStorage.getItem<string>(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function setJsonArray<T>(key: string, values: T[]): Promise<void> {
  await LocalStorage.setItem(key, JSON.stringify(values));
}

export function normalizeFolderPath(path: string): string {
  return resolve(path).replace(/\/$/, "");
}

export function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

export async function getProjectFolders(): Promise<string[]> {
  const folders = await getJsonArray<string>(PROJECT_FOLDERS_KEY);
  return folders.filter(
    (folder): folder is string => typeof folder === "string",
  );
}

export async function addProjectFolders(paths: string[]): Promise<string[]> {
  const folders = await getProjectFolders();
  const seen = new Set(folders.map(normalizeFolderPath));
  const added: string[] = [];

  for (const rawPath of paths) {
    const folder = normalizeFolderPath(rawPath);
    if (!isDirectory(folder) || seen.has(folder)) continue;
    seen.add(folder);
    added.push(folder);
  }

  if (added.length > 0) {
    await setJsonArray(PROJECT_FOLDERS_KEY, [...added, ...folders]);
  }

  return added;
}

export async function moveProjectFolderToTop(path: string): Promise<void> {
  const normalizedPath = normalizeFolderPath(path);
  const folders = await getProjectFolders();
  const selectedFolder = folders.find(
    (folder) => normalizeFolderPath(folder) === normalizedPath,
  );

  if (
    !selectedFolder ||
    normalizeFolderPath(folders[0] ?? "") === normalizedPath
  ) {
    return;
  }

  await setJsonArray(PROJECT_FOLDERS_KEY, [
    selectedFolder,
    ...folders.filter(
      (folder) => normalizeFolderPath(folder) !== normalizedPath,
    ),
  ]);
}

export async function removeProjectFolder(path: string): Promise<void> {
  const normalizedPath = normalizeFolderPath(path);
  const folders = await getProjectFolders();
  await setJsonArray(
    PROJECT_FOLDERS_KEY,
    folders.filter((folder) => normalizeFolderPath(folder) !== normalizedPath),
  );
}
