import { existsSync, statSync } from "fs";
import { basename, dirname, join, relative } from "path";
import { getFrontFinderFolderPath } from "../finder";
import {
  ensureDirectory,
  ensureInsideFolder,
  ensureTargetInsideFolder,
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
  paths: string;
  destinationDirectory?: string;
  newName?: string;
}): Promise<ResolvedFileOperation> {
  const folderPath = await getFrontFinderFolderPath();
  ensureDirectory(folderPath);

  const rawPaths = parsePaths(input.paths);
  if (rawPaths.length === 0) {
    throw new Error("No paths were provided.");
  }

  const sources = rawPaths.map((path) =>
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
  path: string;
  newName: string;
}) {
  const folderPath = await getFrontFinderFolderPath();
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
