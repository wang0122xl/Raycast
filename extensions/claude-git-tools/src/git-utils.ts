import { readdirSync, existsSync, statSync } from "fs";
import { join, basename } from "path";
import { execFileSync, execFile } from "child_process";
import { homedir } from "os";
import { getFolders } from "./storage";

export const EXTENDED_PATH = `${homedir()}/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ""}`;

interface GitRepo {
  fullPath: string;
  displayName: string;
}

export interface GitWorkspaceStatus {
  changed: number;
  untracked: number;
  conflicted: number;
  ahead: number;
  behind: number;
}

export type GitFileStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "conflicted";

export interface GitChangedFile {
  path: string;
  oldPath?: string;
  status: GitFileStatus;
  indexStatus: string;
  worktreeStatus: string;
}

function scanForGitRepos(baseDir: string, maxDepth: number): GitRepo[] {
  const repos: GitRepo[] = [];
  const baseName = basename(baseDir);

  function walk(dir: string, depth: number, relPath: string) {
    if (depth > maxDepth) return;
    try {
      if (existsSync(join(dir, ".git"))) {
        repos.push({
          fullPath: dir,
          displayName: relPath || baseName,
        });
        return;
      }
      if (depth === maxDepth) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.name.startsWith(".")) {
          walk(
            join(dir, entry.name),
            depth + 1,
            relPath ? `${relPath}/${entry.name}` : `${baseName}/${entry.name}`,
          );
        }
      }
    } catch {
      // permission denied etc
    }
  }

  try {
    if (!statSync(baseDir).isDirectory()) return repos;
  } catch {
    return repos;
  }
  walk(baseDir, 0, "");
  return repos;
}

export async function getAllGitRepos(): Promise<GitRepo[]> {
  const folders = await getFolders();
  const seen = new Set<string>();
  const repos: GitRepo[] = [];
  for (const folder of folders) {
    for (const repo of scanForGitRepos(folder, 3)) {
      if (!seen.has(repo.fullPath)) {
        seen.add(repo.fullPath);
        repos.push(repo);
      }
    }
  }
  return repos;
}

export function execGhAsync(args: string[], dir: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "gh",
      args,
      {
        cwd: dir,
        encoding: "utf-8",
        timeout: 15000,
        env: { ...process.env, PATH: EXTENDED_PATH },
      },
      (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      },
    );
  });
}

function parseAheadBehind(branchLine: string) {
  const aheadMatch = branchLine.match(/ahead (\d+)/);
  const behindMatch = branchLine.match(/behind (\d+)/);

  return {
    ahead: aheadMatch ? Number(aheadMatch[1]) : 0,
    behind: behindMatch ? Number(behindMatch[1]) : 0,
  };
}

function isConflictedStatus(status: string) {
  return ["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(status);
}

function getFileStatus(indexStatus: string, worktreeStatus: string) {
  const status = `${indexStatus}${worktreeStatus}`;
  if (status === "??") return "untracked";
  if (isConflictedStatus(status)) return "conflicted";
  if (indexStatus === "R" || worktreeStatus === "R") return "renamed";
  if (indexStatus === "C" || worktreeStatus === "C") return "copied";
  if (indexStatus === "A" || worktreeStatus === "A") return "added";
  if (indexStatus === "D" || worktreeStatus === "D") return "deleted";
  return "modified";
}

function parseStatusPath(rawPath: string) {
  const renameParts = rawPath.split(" -> ");
  if (renameParts.length === 2) {
    return { oldPath: renameParts[0], path: renameParts[1] };
  }
  return { path: rawPath };
}

export function getGitWorkspaceStatus(
  dir: string,
): Promise<GitWorkspaceStatus | null> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["status", "--porcelain=v1", "--branch"],
      {
        cwd: dir,
        encoding: "utf-8",
        timeout: 5000,
        env: { ...process.env, PATH: EXTENDED_PATH },
      },
      (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }

        let changed = 0;
        let untracked = 0;
        let conflicted = 0;
        let ahead = 0;
        let behind = 0;

        for (const line of stdout.split("\n")) {
          if (!line) continue;
          if (line.startsWith("## ")) {
            ({ ahead, behind } = parseAheadBehind(line));
            continue;
          }

          const status = line.slice(0, 2);
          if (status === "??") {
            untracked += 1;
          } else if (isConflictedStatus(status)) {
            conflicted += 1;
          } else {
            changed += 1;
          }
        }

        resolve({ changed, untracked, conflicted, ahead, behind });
      },
    );
  });
}

export function getGitChangedFiles(dir: string): Promise<GitChangedFile[]> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["status", "--porcelain=v1"],
      {
        cwd: dir,
        encoding: "utf-8",
        timeout: 5000,
        env: { ...process.env, PATH: EXTENDED_PATH },
      },
      (err, stdout) => {
        if (err) {
          resolve([]);
          return;
        }

        const files = stdout
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const indexStatus = line[0] || " ";
            const worktreeStatus = line[1] || " ";
            const { oldPath, path } = parseStatusPath(line.slice(3));

            return {
              path,
              oldPath,
              status: getFileStatus(indexStatus, worktreeStatus),
              indexStatus,
              worktreeStatus,
            };
          });

        resolve(files);
      },
    );
  });
}

function execGitDiff(args: string[], dir: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      {
        cwd: dir,
        encoding: "utf-8",
        maxBuffer: 1024 * 1024 * 4,
        timeout: 10000,
        env: { ...process.env, PATH: EXTENDED_PATH },
      },
      (_err, stdout) => {
        resolve(stdout);
      },
    );
  });
}

export async function getGitFileDiff(
  dir: string,
  file: GitChangedFile,
): Promise<string> {
  if (file.status === "untracked") {
    return execGitDiff(
      ["diff", "--no-index", "--", "/dev/null", file.path],
      dir,
    );
  }

  const stagedDiff =
    file.indexStatus !== " " && file.indexStatus !== "?"
      ? await execGitDiff(["diff", "--cached", "--", file.path], dir)
      : "";
  const worktreeDiff =
    file.worktreeStatus !== " " && file.worktreeStatus !== "?"
      ? await execGitDiff(["diff", "--", file.path], dir)
      : "";

  return [stagedDiff, worktreeDiff].filter(Boolean).join("\n");
}

export type MergeMethod = "--merge" | "--rebase" | "--squash";

export const MERGE_METHOD_LABELS: Record<MergeMethod, string> = {
  "--merge": "Merge",
  "--rebase": "Rebase and Merge",
  "--squash": "Squash and Merge",
};

export function extractPrNumber(url: string): string | null {
  const match = url.match(/\/pull\/(\d+)/);
  return match ? match[1] : null;
}

export function dirFromPath(filePath: string): string {
  return filePath.substring(0, filePath.lastIndexOf("/")) || "/";
}

export async function pickFolderDialog(): Promise<string | null> {
  const { execSync } = await import("child_process");
  try {
    const selected = execSync(
      `osascript -e 'POSIX path of (choose folder with prompt "Select a folder to scan")'`,
      { encoding: "utf-8", timeout: 30000 },
    ).trim();
    return selected ? selected.replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

const remoteBaseUrlCache = new Map<
  string,
  { url: string | null; ts: number }
>();
const CACHE_TTL_MS = 60_000;

export function getGitRemoteBaseUrl(dir: string): string | null {
  const now = Date.now();
  const cached = remoteBaseUrlCache.get(dir);
  if (cached && now - cached.ts < CACHE_TTL_MS) return cached.url;

  let result: string | null = null;
  try {
    const url = execFileSync("git", ["remote", "get-url", "origin"], {
      cwd: dir,
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    const httpsMatch = url.match(
      /^(https?:\/\/[^/]+\/[^/]+\/[^/]+?)(?:\.git)?$/,
    );
    if (httpsMatch) {
      result = httpsMatch[1];
    } else {
      const sshMatch = url.match(/^(?:git@)?([^:]+):(.+?)(?:\.git)?$/);
      if (sshMatch) result = `https://${sshMatch[1]}/${sshMatch[2]}`;
    }
  } catch {
    // git command failed
  }
  remoteBaseUrlCache.set(dir, { url: result, ts: now });
  return result;
}

export function replaceGitUrlBase(url: string, remoteBaseUrl: string): string {
  if (!remoteBaseUrl) return url;
  // Match https://host/org/repo in the URL (the first 3 path-like segments)
  const urlBaseMatch = url.match(/^(https?:\/\/[^/]+\/[^/]+\/[^/]+)(\/.*)?$/);
  if (!urlBaseMatch) return url;
  const extractedBase = urlBaseMatch[1];
  const rest = urlBaseMatch[2] || "";
  if (extractedBase === remoteBaseUrl) return url;
  return remoteBaseUrl + rest;
}
