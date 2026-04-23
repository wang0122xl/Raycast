import { readdirSync, existsSync, statSync } from "fs";
import { join, basename } from "path";
import { getFolders } from "./storage";

interface GitRepo {
  fullPath: string;
  displayName: string;
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
          walk(join(dir, entry.name), depth + 1, relPath ? `${relPath}/${entry.name}` : `${baseName}/${entry.name}`);
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
