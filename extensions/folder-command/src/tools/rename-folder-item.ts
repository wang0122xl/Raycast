import { Action, Tool } from "@raycast/api";
import { renameSync } from "fs";
import { basename } from "path";
import { formatFinderError } from "../finder";
import { resolveRenameOperation } from "./file-operation-utils";

type Input = {
  path: string;
  newName: string;
  reason?: string;
};

export default async function RenameFolderItem(input: Input) {
  try {
    const operation = await resolveRenameOperation(input);
    renameSync(operation.source, operation.target);

    return {
      type: "success",
      folderPath: operation.folderPath,
      renamed: operation.source,
      target: operation.target,
      message: `Renamed ${operation.source} to ${operation.target}`,
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
    const operation = await resolveRenameOperation(input);

    return {
      style: Action.Style.Destructive,
      message: "Rename this Finder folder item?",
      info: [
        { name: "Finder Folder", value: operation.folderPath },
        { name: "Current Name", value: basename(operation.source) },
        { name: "New Name", value: basename(operation.target) },
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
