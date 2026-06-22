import { existsSync, readdirSync, renameSync, statSync } from "fs";
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
  ensureTargetInsideFolder,
  resolveScopedDirectory,
} from "../path-utils";
import { showTaskFailure, showTaskSuccess } from "../toast-utils";
import { formatOperationMessage } from "./operation-output";

type Input = {
  /** The contextToken returned by get-front-finder-folder for this request, when available. */
  contextToken?: string;
  /** Root-level directory name under the locked Finder folder to limit filtered matching. */
  sourceDirectory?: string;
  /** File extension to match without a dot; for "PDF files", pass "pdf". */
  fileExtension?: string;
  /** Multiple file extensions to match without dots, separated by commas or newlines. */
  fileExtensions?: string;
  /** Filename or wildcard pattern to match, for example "*.pdf" or "episode". */
  pattern?: string;
  /** First number to use in the sequence. */
  startNumber?: number;
  /** Minimum digit count for zero-padding. */
  padding?: number;
  /** Maximum recursive depth. Omit this to scan all nested folders. */
  maxDepth?: number;
  /** Whether to include hidden dotfiles and dotfolders. */
  includeHidden?: boolean;
  /** Short reason for the rename operation. */
  reason?: string;
};

interface RenamePlanItem {
  source: string;
  temporary: string;
  target: string;
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
  return matches.sort((a, b) =>
    relative(folderPath, a).localeCompare(relative(folderPath, b), undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
}

function buildTargetName(index: number, extension: string, padding: number) {
  return `${String(index).padStart(padding, "0")}${extension}`;
}

function buildRenamePlan(
  input: Input,
  folderPath: string,
  sourceDirectory: string,
): RenamePlanItem[] {
  const sources = findMatchingFiles(input, folderPath, sourceDirectory).map(
    (path) => ensureInsideFolder(path, folderPath),
  );

  if (sources.length === 0) {
    throw new Error("No matching files were found.");
  }

  const startNumber = Math.max(Math.floor(input.startNumber ?? 1), 0);
  const padding = Math.min(Math.max(Math.floor(input.padding ?? 0), 0), 8);
  const sourceSet = new Set(sources);
  const targetSet = new Set<string>();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return sources.map((source, index) => {
    const targetExtension = extname(source);
    const target = ensureTargetInsideFolder(
      join(
        dirname(source),
        buildTargetName(startNumber + index, targetExtension, padding),
      ),
      folderPath,
    );

    if (targetSet.has(target)) {
      throw new Error(`Multiple files resolve to the same target: ${target}`);
    }
    targetSet.add(target);

    if (existsSync(target) && !sourceSet.has(target)) {
      throw new Error(`Target already exists: ${target}`);
    }

    const temporary = ensureTargetInsideFolder(
      join(dirname(source), `.finder-command-rename-${stamp}-${index}.tmp`),
      folderPath,
    );

    if (existsSync(temporary)) {
      throw new Error(`Temporary path already exists: ${temporary}`);
    }

    return { source, temporary, target };
  });
}

export async function numberFolderFiles(
  input: Input,
  tool = "number-folder-files",
) {
  let operationId: string | undefined;
  const completedTemporary: RenamePlanItem[] = [];
  const completedFinal: RenamePlanItem[] = [];

  try {
    const folderPath = await getScopedFinderFolderPath(input.contextToken);
    ensureDirectory(folderPath);
    const sourceDirectory = resolveScopedDirectory(
      input.sourceDirectory,
      folderPath,
    );

    const plan = buildRenamePlan(input, folderPath, sourceDirectory);
    operationId = await createJournalOperation(tool);
    const restoreActions = snapshotItems({
      operationId,
      folderPath,
      paths: plan.map((item) => item.source),
    });

    for (const item of plan) {
      renameSync(item.source, item.temporary);
      completedTemporary.push(item);
    }

    for (const item of plan) {
      renameSync(item.temporary, item.target);
      completedFinal.push(item);
    }
    await recordOperation({
      operationId,
      tool,
      folderPath,
      summary: `Renamed ${plan.length} file(s) to sequential names`,
      actions: [
        ...plan.map((item) => ({
          type: "remove" as const,
          path: item.target,
          sourcePath: item.source,
        })),
        ...restoreActions,
      ],
    });
    await showTaskSuccess(
      "Finder Command completed",
      `Renamed ${plan.length} file(s).`,
    );

    return {
      type: "success",
      operation: tool,
      folderPath,
      renamed: plan.map((item) => ({
        from: relative(folderPath, item.source),
        to: relative(folderPath, item.target),
      })),
      affectedPaths: plan.map((item) => ({
        path: item.source,
        target: item.target,
      })),
      message: formatOperationMessage({
        operation: `批量编号重命名 (${tool})`,
        summary: `已重命名 ${plan.length} 个文件`,
        affectedPaths: plan.map((item) => ({
          path: item.source,
          target: item.target,
        })),
      }),
    };
  } catch (error) {
    for (const item of completedFinal.reverse()) {
      if (existsSync(item.target)) {
        try {
          renameSync(item.target, item.source);
        } catch {
          // Best-effort rollback for partial failures.
        }
      }
    }

    for (const item of completedTemporary.reverse()) {
      if (existsSync(item.temporary)) {
        try {
          renameSync(item.temporary, item.source);
        } catch {
          // Best-effort rollback for partial failures.
        }
      }
    }
    if (operationId) cleanupJournalOperation(operationId);
    const message = formatFinderError(error);
    await showTaskFailure("Finder Command failed", message);

    return {
      type: "error",
      message,
    };
  }
}

export default async function NumberFolderFiles(input: Input) {
  return numberFolderFiles(input);
}
