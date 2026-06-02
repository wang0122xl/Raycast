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
  resolveFolderPath,
} from "../path-utils";

type Input = {
  paths?: string;
  pattern?: string;
  fileExtension?: string;
  maxDepth?: number;
  includeHidden?: boolean;
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
  const query = pattern?.trim();
  if (!query) return true;
  if (query.includes("*")) return wildcardToRegExp(query).test(path);
  return path.toLowerCase().includes(query.toLowerCase());
}

function normalizeExtension(fileExtension?: string) {
  const normalized = fileExtension?.trim().toLowerCase();
  if (!normalized) return undefined;
  return normalized.startsWith(".") ? normalized : `.${normalized}`;
}

function findMatchingFiles(input: Input, folderPath: string) {
  const extension = normalizeExtension(input.fileExtension);
  const maxDepth = Math.min(Math.max(input.maxDepth ?? 2, 0), 5);
  const includeHidden = input.includeHidden ?? false;
  const matches: string[] = [];

  function walk(dir: string, depth: number) {
    if (depth > maxDepth || matches.length >= 300) return;

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
        (!extension || extname(entry.name).toLowerCase() === extension) &&
        matchesPattern(relativePath, input.pattern)
      ) {
        matches.push(fullPath);
      }
    }
  }

  walk(folderPath, 0);
  return matches;
}

async function resolveInputPaths(input: Input) {
  const folderPath = await getScopedFinderFolderPath();
  ensureDirectory(folderPath);

  const paths = parsePaths(input.paths ?? "");

  if (paths.length === 0) {
    if (!input.pattern && !input.fileExtension) {
      throw new Error(
        "No paths or filters were provided. Pass paths, fileExtension, or pattern.",
      );
    }

    const resolvedPaths = findMatchingFiles(input, folderPath).map((path) =>
      ensureInsideFolder(path, folderPath),
    );

    if (resolvedPaths.length > 0) {
      return { folderPath, resolvedPaths };
    }

    if (input.pattern || input.fileExtension) {
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

    return {
      type: "success",
      folderPath,
      trashed: resolvedPaths,
      message: `Moved ${resolvedPaths.length} item(s) to Trash:\n${resolvedPaths.join("\n")}`,
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

    return {
      type: "error",
      message: formatFinderError(error),
    };
  }
}
