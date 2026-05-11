import { basename, dirname } from "path";

export interface FolderListItem {
  path: string;
  title: string;
  subtitle: string;
  keywords: string[];
}

export function toFolderListItem(path: string): FolderListItem {
  const title = basename(path) || path;
  const parent = dirname(path);
  return {
    path,
    title,
    subtitle: parent === "." ? path : parent,
    keywords: [path, title, parent],
  };
}
