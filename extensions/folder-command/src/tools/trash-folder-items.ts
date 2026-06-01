import { Action, Tool, trash } from "@raycast/api";
import { basename } from "path";
import { formatFinderError, getFrontFinderFolderPath } from "../finder";
import { ensureInsideFolder, resolveFolderPath } from "../path-utils";

type Input = {
  paths: string;
  reason?: string;
};

function parsePaths(rawPaths: string) {
  return rawPaths
    .split(/\r?\n|\|{2,}/)
    .map((path) => path.trim())
    .filter(Boolean);
}

async function resolveInputPaths(input: Input) {
  const folderPath = await getFrontFinderFolderPath();
  const paths = parsePaths(input.paths);

  if (paths.length === 0) {
    throw new Error("No paths were provided.");
  }

  const resolvedPaths = paths.map((path) =>
    ensureInsideFolder(resolveFolderPath(path, folderPath), folderPath),
  );

  return { folderPath, resolvedPaths };
}

export default async function TrashFolderItems(input: Input) {
  try {
    const { folderPath, resolvedPaths } = await resolveInputPaths(input);
    await trash(resolvedPaths);

    return {
      type: "success",
      folderPath,
      trashed: resolvedPaths,
      message: `Moved ${resolvedPaths.length} item(s) to Trash:\n${resolvedPaths.join("\n")}`,
    };
  } catch (error) {
    return {
      type: "error",
      message: formatFinderError(error),
    };
  }
}

export const confirmation: Tool.Confirmation<Input> = async (input: Input) => {
  try {
    const { folderPath, resolvedPaths } = await resolveInputPaths(input);

    return {
      style: Action.Style.Destructive,
      message: "Move these Finder folder items to Trash?",
      info: [
        { name: "Finder Folder", value: folderPath },
        { name: "Items", value: String(resolvedPaths.length) },
        {
          name: "First Item",
          value: resolvedPaths[0] ? basename(resolvedPaths[0]) : undefined,
        },
        { name: "Reason", value: input.reason },
      ],
    };
  } catch (error) {
    return {
      style: Action.Style.Destructive,
      message: formatFinderError(error),
    };
  }
};
