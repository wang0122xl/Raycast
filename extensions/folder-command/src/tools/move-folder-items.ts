import { Action, Tool } from "@raycast/api";
import { renameSync } from "fs";
import { basename } from "path";
import { formatFinderError } from "../finder";
import { resolveFileOperation } from "./file-operation-utils";

type Input = {
  paths: string;
  destinationDirectory?: string;
  newName?: string;
  reason?: string;
};

export default async function MoveFolderItems(input: Input) {
  try {
    const operation = await resolveFileOperation(input);

    operation.sources.forEach((source, index) => {
      renameSync(source, operation.targets[index]);
    });

    return {
      type: "success",
      folderPath: operation.folderPath,
      moved: operation.sources,
      targets: operation.targets,
      message: `Moved ${operation.sources.length} item(s):\n${operation.targets.join("\n")}`,
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
    const operation = await resolveFileOperation(input);

    return {
      style: Action.Style.Destructive,
      message: "Move these Finder folder items?",
      info: [
        { name: "Finder Folder", value: operation.folderPath },
        { name: "Items", value: String(operation.sources.length) },
        { name: "Destination", value: operation.destinationDirectory },
        {
          name: "First Item",
          value: operation.sources[0]
            ? basename(operation.sources[0])
            : undefined,
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
