import { existsSync, readdirSync, statSync } from "fs";
import { basename, dirname, extname, join, relative } from "path";
import { getScopedFinderFolderPath } from "../finder";
import {
  ensureDirectory,
  ensureInsideFolder,
  ensureTargetInsideFolder,
  resolveScopedDirectory,
  resolveFolderPath,
} from "../path-utils";

export interface ResolvedFileOperation {
  folderPath: string;
  sources: string[];
  destinationDirectory: string;
  targets: string[];
}

export function parsePaths(rawPaths: string) {
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

function normalizeExtensions(input: {
  fileExtension?: string;
  fileExtensions?: string;
}) {
  const rawExtensions = [input.fileExtension, input.fileExtensions]
    .filter(Boolean)
    .flatMap((value) => String(value).split(/[\s,;|]+/))
    .map((value) => normalizeExtension(value))
    .filter((value): value is string => Boolean(value));

  return new Set(rawExtensions);
}

function findMatchingFiles(
  input: {
    pattern?: string;
    fileExtension?: string;
    fileExtensions?: string;
    maxDepth?: number;
    includeHidden?: boolean;
  },
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

function validateSingleNewName(newName: string) {
  const trimmed = newName.trim();

  if (!trimmed || trimmed === "." || trimmed === "..") {
    throw new Error("New name is invalid.");
  }

  if (trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error("New name must not include path separators.");
  }

  return trimmed;
}

function ensureTargetDoesNotExist(targetPath: string) {
  if (existsSync(targetPath)) {
    throw new Error(`Target already exists: ${targetPath}`);
  }
}

function ensureUniqueTargets(targets: string[]) {
  const seenTargets = new Set<string>();

  for (const target of targets) {
    if (seenTargets.has(target)) {
      throw new Error(
        `Multiple source paths resolve to the same target: ${target}`,
      );
    }
    seenTargets.add(target);
  }
}

function ensureNotNestedInSource(sourcePath: string, targetPath: string) {
  if (!statSync(sourcePath).isDirectory()) return;

  const relativeTarget = relative(sourcePath, targetPath);
  if (
    !relativeTarget ||
    (!relativeTarget.startsWith("..") && relativeTarget !== "..")
  ) {
    throw new Error(
      `Target cannot be inside the source directory: ${targetPath}`,
    );
  }
}

export async function resolveFileOperation(input: {
  contextToken?: string;
  sourceDirectory?: string;
  paths?: string;
  destinationDirectory?: string;
  newName?: string;
  pattern?: string;
  fileExtension?: string;
  fileExtensions?: string;
  maxDepth?: number;
  includeHidden?: boolean;
}): Promise<ResolvedFileOperation> {
  const folderPath = await getScopedFinderFolderPath(input.contextToken);
  ensureDirectory(folderPath);
  const sourceDirectory = resolveScopedDirectory(
    input.sourceDirectory,
    folderPath,
  );

  const rawPaths = parsePaths(input.paths ?? "");
  const hasFilters = Boolean(
    input.pattern || input.fileExtension || input.fileExtensions,
  );
  const filteredPaths =
    rawPaths.length === 0 && hasFilters
      ? findMatchingFiles(input, folderPath, sourceDirectory)
      : [];

  if (rawPaths.length === 0 && filteredPaths.length === 0) {
    if (hasFilters) {
      throw new Error("No matching files were found.");
    }

    throw new Error("No paths were provided.");
  }

  const sources = (rawPaths.length > 0 ? rawPaths : filteredPaths).map((path) =>
    ensureInsideFolder(resolveFolderPath(path, folderPath), folderPath),
  );
  const destinationDirectory = ensureInsideFolder(
    resolveFolderPath(input.destinationDirectory?.trim() || ".", folderPath),
    folderPath,
  );
  ensureDirectory(destinationDirectory);

  if (input.newName && sources.length !== 1) {
    throw new Error("newName can only be used with one source path.");
  }

  const targets = sources.map((source) => {
    const targetName = input.newName
      ? validateSingleNewName(input.newName)
      : basename(source);
    const targetPath = ensureTargetInsideFolder(
      join(destinationDirectory, targetName),
      folderPath,
    );

    ensureTargetDoesNotExist(targetPath);
    ensureNotNestedInSource(source, targetPath);

    return targetPath;
  });
  ensureUniqueTargets(targets);

  return { folderPath, sources, destinationDirectory, targets };
}

export async function resolveRenameOperation(input: {
  contextToken?: string;
  path: string;
  newName: string;
}) {
  const folderPath = await getScopedFinderFolderPath(input.contextToken);
  ensureDirectory(folderPath);

  const source = ensureInsideFolder(
    resolveFolderPath(input.path, folderPath),
    folderPath,
  );
  const target = ensureTargetInsideFolder(
    join(dirname(source), validateSingleNewName(input.newName)),
    folderPath,
  );

  ensureTargetDoesNotExist(target);

  return { folderPath, source, target };
}
