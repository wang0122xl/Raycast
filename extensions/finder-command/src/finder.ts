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
  updatedAt: number;
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
  const context: FinderFolderContext = {
    folderPath,
    updatedAt: Date.now(),
  };
  await LocalStorage.setItem(
    FINDER_FOLDER_CONTEXT_KEY,
    JSON.stringify(context),
  );

  return folderPath;
}

export async function getScopedFinderFolderPath() {
  const rawContext = await LocalStorage.getItem<string>(
    FINDER_FOLDER_CONTEXT_KEY,
  );

  if (rawContext) {
    try {
      const context = JSON.parse(rawContext) as FinderFolderContext;
      if (
        context.folderPath &&
        Date.now() - context.updatedAt <= FINDER_FOLDER_CONTEXT_MAX_AGE_MS
      ) {
        return context.folderPath;
      }
    } catch {
      await LocalStorage.removeItem(FINDER_FOLDER_CONTEXT_KEY);
    }
  }

  return refreshFrontFinderFolderContext();
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
