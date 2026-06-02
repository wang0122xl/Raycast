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
} from "../path-utils";

type Input = {
  fileExtension?: string;
  pattern?: string;
  startNumber?: number;
  padding?: number;
  maxDepth?: number;
  includeHidden?: boolean;
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
  const maxDepth = Math.min(Math.max(input.maxDepth ?? 0, 0), 5);
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

function buildRenamePlan(input: Input, folderPath: string): RenamePlanItem[] {
  const sources = findMatchingFiles(input, folderPath).map((path) =>
    ensureInsideFolder(path, folderPath),
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
    const targetExtension =
      normalizeExtension(input.fileExtension) ?? extname(source);
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
    const folderPath = await getScopedFinderFolderPath();
    ensureDirectory(folderPath);

    const plan = buildRenamePlan(input, folderPath);
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

    return {
      type: "success",
      folderPath,
      renamed: plan.map((item) => ({
        from: relative(folderPath, item.source),
        to: relative(folderPath, item.target),
      })),
      message: `Renamed ${plan.length} file(s):\n${plan
        .map(
          (item) =>
            `${relative(folderPath, item.source)} -> ${relative(folderPath, item.target)}`,
        )
        .join("\n")}`,
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

    return {
      type: "error",
      message: formatFinderError(error),
    };
  }
}

export default async function NumberFolderFiles(input: Input) {
  return numberFolderFiles(input);
}
