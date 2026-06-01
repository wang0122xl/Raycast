import { existsSync, realpathSync, statSync } from "fs";
import { isAbsolute, resolve } from "path";

export function ensureInsideFolder(targetPath: string, folderPath: string) {
  if (!existsSync(targetPath)) {
    throw new Error(`Path does not exist: ${targetPath}`);
  }

  const realFolder = realpathSync(folderPath).replace(/\/+$/, "");
  const realTarget = realpathSync(targetPath).replace(/\/+$/, "");

  if (realTarget !== realFolder && !realTarget.startsWith(`${realFolder}/`)) {
    throw new Error(`Path is outside the front Finder folder: ${targetPath}`);
  }

  return realTarget;
}

export function resolveFolderPath(inputPath: string, folderPath: string) {
  return isAbsolute(inputPath) ? inputPath : resolve(folderPath, inputPath);
}

export function ensureDirectory(folderPath: string) {
  const stat = statSync(folderPath);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${folderPath}`);
  }
}

export function truncateText(text: string, maxLength = 12_000) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n\n[truncated ${text.length - maxLength} characters]`;
}
