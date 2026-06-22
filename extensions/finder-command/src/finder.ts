import { execFile } from "child_process";
import { promisify } from "util";
import { LocalStorage } from "@raycast/api";
import { beginNewUndoScope } from "./operation-journal";

const execFileAsync = promisify(execFile);
const FINDER_FOLDER_CONTEXT_KEY = "finder-command.current-folder";
const FINDER_FOLDER_CONTEXT_MAX_AGE_MS = 120_000;

const FINDER_FOLDER_SCRIPT =
  'tell application "Finder" to POSIX path of (target of front window as alias)';

interface FinderFolderContext {
  folderPath: string;
  contextToken: string;
  updatedAt: number;
}

function createContextToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function getFrontFinderFolderPath(): Promise<string> {
  const { stdout } = await execFileAsync(
    "osascript",
    ["-e", FINDER_FOLDER_SCRIPT],
    { timeout: 10_000 },
  );
  const folderPath = stdout.trim();

  if (!folderPath) {
    throw new Error("Finder did not return a folder path.");
  }

  return folderPath;
}

export async function refreshFrontFinderFolderContext() {
  await beginNewUndoScope();

  const folderPath = await getFrontFinderFolderPath();
  const contextToken = createContextToken();
  const context: FinderFolderContext = {
    folderPath,
    contextToken,
    updatedAt: Date.now(),
  };
  await LocalStorage.setItem(
    FINDER_FOLDER_CONTEXT_KEY,
    JSON.stringify(context),
  );

  return { folderPath, contextToken };
}

export async function getScopedFinderFolderPath(contextToken?: string) {
  const rawContext = await LocalStorage.getItem<string>(
    FINDER_FOLDER_CONTEXT_KEY,
  );

  if (rawContext) {
    let context: FinderFolderContext;
    try {
      context = JSON.parse(rawContext) as FinderFolderContext;
    } catch {
      await LocalStorage.removeItem(FINDER_FOLDER_CONTEXT_KEY);
      throw new Error(
        "The Finder folder context is invalid. Call get-front-finder-folder again for this @finder-command request.",
      );
    }

    const isFresh =
      context.folderPath &&
      Date.now() - context.updatedAt <= FINDER_FOLDER_CONTEXT_MAX_AGE_MS;

    if (isFresh && !contextToken?.trim()) {
      return context.folderPath;
    }

    if (isFresh && context.contextToken === contextToken) {
      return context.folderPath;
    }

    throw new Error(
      "The Finder folder contextToken is stale or belongs to a previous request. Call get-front-finder-folder again for this @finder-command request.",
    );
  }

  throw new Error(
    "No locked Finder folder is available. Start a normal request with get-front-finder-folder first.",
  );
}

export function formatFinderError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes("Can’t get") ||
    message.includes("Can't get") ||
    message.includes("-1728")
  ) {
    return "Open a Finder window and try again.";
  }

  return message;
}
