import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const FINDER_FOLDER_SCRIPT =
  'tell application "Finder" to POSIX path of (target of front window as alias)';

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
