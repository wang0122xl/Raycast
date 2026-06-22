import { trash } from "@raycast/api";
import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from "fs";
import { dirname, extname, join, relative } from "path";
import { formatFinderError, getScopedFinderFolderPath } from "../finder";
import {
  cleanupJournalOperation,
  createJournalOperation,
  recordOperation,
  snapshotItems,
} from "../operation-journal";
import {
  ensureDirectory,
  ensureInsideFolder,
  resolveScopedDirectory,
  resolveFolderPath,
} from "../path-utils";
import { showTaskFailure, showTaskSuccess } from "../toast-utils";
import { formatOperationMessage } from "./operation-output";

type Input = {
  /** The contextToken returned by get-front-finder-folder for this request, when available. */
  contextToken?: string;
  /** Root-level directory name under the locked Finder folder to limit filtered matching. */
  sourceDirectory?: string;
  /** Newline-separated relative paths to move to Trash, when operating on specific files. */
  paths?: string;
  /** Filename or wildcard pattern to match, for example "*.pdf" or "invoice". */
  pattern?: string;
  /** File extension to match without a dot; for "PDF files", pass "pdf". */
  fileExtension?: string;
  /** Multiple file extensions to match without dots, separated by commas or newlines. */
  fileExtensions?: string;
  /** Maximum recursive depth. Omit this to scan all nested folders. */
  maxDepth?: number;
  /** Whether to include hidden dotfiles and dotfolders. */
  includeHidden?: boolean;
  /** Short reason for the trash operation. */
  reason?: string;
};

function parsePaths(rawPaths: string) {
  return rawPaths
    .split(/\r?\n|\|{2,}/)
    .map((path) => path.trim())
    .filter(Boolean);
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

function normalizeExtension(fileExtension?: string) {
  const normalized = fileExtension?.trim().toLowerCase();
  if (!normalized) return undefined;
  return normalized.startsWith(".") ? normalized : `.${normalized}`;
}

function normalizeExtensions(input: Input) {
  const rawExtensions = [input.fileExtension, input.fileExtensions]
    .filter(Boolean)
    .flatMap((value) => String(value).split(/[\s,;|]+/))
    .map((value) => normalizeExtension(value))
    .filter((value): value is string => Boolean(value));

  return new Set(rawExtensions);
}

function findMatchingFiles(
  input: Input,
  folderPath: string,
  sourceDirectory: string,
) {
  const extensions = normalizeExtensions(input);
  const maxDepth =
    input.maxDepth === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(Math.floor(input.maxDepth), 0);
  const includeHidden = input.includeHidden ?? false;
  const matches: string[] = [];

  function walk(dir: string, depth: number) {
    if (depth > maxDepth) return;

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!includeHidden && entry.name.startsWith(".")) continue;

      const fullPath = join(dir, entry.name);
      const relativePath = relative(folderPath, fullPath);

      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
        continue;
      }

      if (
        statSync(fullPath).isFile() &&
        (extensions.size === 0 ||
          extensions.has(extname(entry.name).toLowerCase())) &&
        matchesPattern(relativePath, input.pattern)
      ) {
        matches.push(fullPath);
      }
    }
  }

  walk(sourceDirectory, 0);
  return matches;
}

async function resolveInputPaths(input: Input) {
  const folderPath = await getScopedFinderFolderPath(input.contextToken);
  ensureDirectory(folderPath);
  const sourceDirectory = resolveScopedDirectory(
    input.sourceDirectory,
    folderPath,
  );

  const paths = parsePaths(input.paths ?? "");

  if (paths.length === 0) {
    if (!input.pattern && !input.fileExtension && !input.fileExtensions) {
      throw new Error(
        "No paths or filters were provided. Pass paths, fileExtension, fileExtensions, or pattern.",
      );
    }

    const resolvedPaths = findMatchingFiles(
      input,
      folderPath,
      sourceDirectory,
    ).map((path) => ensureInsideFolder(path, folderPath));

    if (resolvedPaths.length > 0) {
      return { folderPath, resolvedPaths };
    }

    if (input.pattern || input.fileExtension || input.fileExtensions) {
      throw new Error("No matching files were found.");
    }
  }

  const resolvedPaths = paths.map((path) =>
    ensureInsideFolder(resolveFolderPath(path, folderPath), folderPath),
  );

  return { folderPath, resolvedPaths };
}

export default async function TrashFolderItems(input: Input) {
  let operationId: string | undefined;
  let restoreActions: ReturnType<typeof snapshotItems> = [];
  let movedToTrash = false;

  try {
    const { folderPath, resolvedPaths } = await resolveInputPaths(input);
    operationId = await createJournalOperation("trash-folder-items");
    restoreActions = snapshotItems({
      operationId,
      folderPath,
      paths: resolvedPaths,
    });

    await trash(resolvedPaths);
    movedToTrash = true;
    await recordOperation({
      operationId,
      tool: "trash-folder-items",
      folderPath,
      summary: `Moved ${resolvedPaths.length} item(s) to Trash`,
      actions: restoreActions,
    });
    await showTaskSuccess(
      "Finder Command completed",
      `Moved ${resolvedPaths.length} item(s) to Trash.`,
    );

    return {
      type: "success",
      operation: "trash-folder-items",
      folderPath,
      trashed: resolvedPaths,
      affectedPaths: resolvedPaths.map((path) => ({ path })),
      message: formatOperationMessage({
        operation: "移入废纸篓 (trash-folder-items)",
        summary: `已移入废纸篓 ${resolvedPaths.length} 项`,
        affectedPaths: resolvedPaths.map((path) => ({ path })),
      }),
    };
  } catch (error) {
    if (movedToTrash) {
      for (const action of restoreActions) {
        if (action.type === "restore") {
          try {
            rmSync(action.path, { recursive: true, force: true });
            mkdirSync(dirname(action.path), { recursive: true });
            cpSync(action.snapshotPath, action.path, {
              recursive: true,
              errorOnExist: true,
              force: false,
              preserveTimestamps: true,
            });
          } catch {
            // Best-effort restore for partial failures.
          }
        }
      }
    }
    if (operationId) cleanupJournalOperation(operationId);
    const message = formatFinderError(error);
    await showTaskFailure("Finder Command failed", message);

    return {
      type: "error",
      code:
        message ===
        "No paths or filters were provided. Pass paths, fileExtension, fileExtensions, or pattern."
          ? "MISSING_PATHS_OR_FILTERS"
          : undefined,
      retryWith:
        message ===
        "No paths or filters were provided. Pass paths, fileExtension, fileExtensions, or pattern."
          ? {
              fileExtension:
                'If the user requested a file type such as "PDF files", call this tool again with fileExtension set to that extension, for example "pdf".',
            }
          : undefined,
      message,
    };
  }
}
