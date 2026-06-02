import { readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { formatFinderError, getScopedFinderFolderPath } from "../finder";
import { ensureDirectory, truncateText } from "../path-utils";

type Input = {
  pattern?: string;
  maxDepth?: number;
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
  const query = pattern?.trim();
  if (!query) return true;
  if (query.includes("*")) return wildcardToRegExp(query).test(path);
  return path.toLowerCase().includes(query.toLowerCase());
}

function listEntries(
  folderPath: string,
  pattern: string | undefined,
  maxDepth: number,
  includeHidden: boolean,
) {
  const entries: FileEntry[] = [];

  function walk(dir: string, depth: number) {
    if (depth > maxDepth || entries.length >= 300) return;

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

  walk(folderPath, 0);
  return entries;
}

export default async function ListFolderFiles(input: Input) {
  try {
    const folderPath = await getScopedFinderFolderPath();
    ensureDirectory(folderPath);

    const maxDepth = Math.min(Math.max(input.maxDepth ?? 2, 0), 5);
    const entries = listEntries(
      folderPath,
      input.pattern,
      maxDepth,
      input.includeHidden ?? false,
    );

    return {
      type: "success",
      folderPath,
      count: entries.length,
      extensionCounts: buildExtensionCounts(entries),
      entries,
      message: truncateText(
        entries.length > 0
          ? entries
              .map((entry) =>
                entry.type === "directory"
                  ? `${entry.path}/`
                  : `${entry.path} (${entry.size} bytes)`,
              )
              .join("\n")
          : "No matching files found.",
      ),
    };
  } catch (error) {
    return {
      type: "error",
      message: formatFinderError(error),
    };
  }
}
