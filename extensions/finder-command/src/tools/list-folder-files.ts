import { readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { formatFinderError, getScopedFinderFolderPath } from "../finder";
import {
  ensureDirectory,
  resolveScopedDirectory,
  truncateText,
} from "../path-utils";
import { showTaskFailure, showTaskSuccess } from "../toast-utils";
import { formatOperationMessage } from "./operation-output";

type Input = {
  /** The contextToken returned by get-front-finder-folder for this request, when available. */
  contextToken?: string;
  /** Root-level directory name under the locked Finder folder to limit the recursive scan. */
  sourceDirectory?: string;
  /** Filename or wildcard pattern to match, for example "*.pdf" or "invoice". */
  pattern?: string;
  /** Maximum recursive depth. Omit this to scan all nested folders. */
  maxDepth?: number;
  /** Whether to include hidden dotfiles and dotfolders. */
  includeHidden?: boolean;
};

interface FileEntry {
  path: string;
  type: "directory" | "file";
  size?: number;
}

function buildExtensionCounts(entries: FileEntry[]) {
  const counts: Record<string, number> = {};

  for (const entry of entries) {
    if (entry.type !== "file") continue;

    const match = entry.path.match(/\.([^.\\/]+)$/);
    const extension = match ? match[1].toLowerCase() : "(no extension)";
    counts[extension] = (counts[extension] ?? 0) + 1;
  }

  return counts;
}

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[|\\{}()[\]^$+?.]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(escaped, "i");
}

function matchesPattern(path: string, pattern?: string) {
  const queries = pattern
    ?.split(/[\r\n,;|]+/)
    .map((query) => query.trim())
    .filter(Boolean);

  if (!queries || queries.length === 0) return true;

  return queries.some((query) =>
    query.includes("*")
      ? wildcardToRegExp(query).test(path)
      : path.toLowerCase().includes(query.toLowerCase()),
  );
}

function listEntries(
  folderPath: string,
  sourceDirectory: string,
  pattern: string | undefined,
  maxDepth: number,
  includeHidden: boolean,
) {
  const entries: FileEntry[] = [];

  function walk(dir: string, depth: number) {
    if (depth > maxDepth) return;

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!includeHidden && entry.name.startsWith(".")) continue;

      const fullPath = join(dir, entry.name);
      const relativePath = relative(folderPath, fullPath);
      const isDirectory = entry.isDirectory();

      if (matchesPattern(relativePath, pattern)) {
        entries.push({
          path: relativePath,
          type: isDirectory ? "directory" : "file",
          size: isDirectory ? undefined : statSync(fullPath).size,
        });
      }

      if (isDirectory) {
        walk(fullPath, depth + 1);
      }
    }
  }

  walk(sourceDirectory, 0);
  return entries;
}

export default async function ListFolderFiles(input: Input) {
  try {
    const folderPath = await getScopedFinderFolderPath(input.contextToken);
    ensureDirectory(folderPath);
    const sourceDirectory = resolveScopedDirectory(
      input.sourceDirectory,
      folderPath,
    );

    const maxDepth =
      input.maxDepth === undefined
        ? Number.POSITIVE_INFINITY
        : Math.max(Math.floor(input.maxDepth), 0);
    const entries = listEntries(
      folderPath,
      sourceDirectory,
      input.pattern,
      maxDepth,
      input.includeHidden ?? false,
    );
    await showTaskSuccess(
      "Finder Command completed",
      `Listed ${entries.length} item(s).`,
    );

    return {
      type: "success",
      operation: "list-folder-files",
      folderPath,
      sourceDirectory,
      count: entries.length,
      extensionCounts: buildExtensionCounts(entries),
      entries,
      affectedPaths: entries.map((entry) => ({ path: entry.path })),
      message: truncateText(
        formatOperationMessage({
          operation: "列出文件/目录 (list-folder-files)",
          summary: `匹配 ${entries.length} 项`,
          affectedPaths: entries.map((entry) => ({
            path: entry.type === "directory" ? `${entry.path}/` : entry.path,
          })),
        }),
      ),
    };
  } catch (error) {
    const message = formatFinderError(error);
    await showTaskFailure("Finder Command failed", message);

    return {
      type: "error",
      message,
    };
  }
}
