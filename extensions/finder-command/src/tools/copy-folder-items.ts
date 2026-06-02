import { cpSync, rmSync } from "fs";
import { formatFinderError } from "../finder";
import {
  cleanupJournalOperation,
  createJournalOperation,
  recordOperation,
} from "../operation-journal";
import { showTaskFailure, showTaskSuccess } from "../toast-utils";
import { resolveFileOperation } from "./file-operation-utils";

type Input = {
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
  reason?: string;
};

export default async function CopyFolderItems(input: Input) {
  let operationId: string | undefined;
  const completedTargets: string[] = [];

  try {
    const operation = await resolveFileOperation(input);
    operationId = await createJournalOperation("copy-folder-items");

    operation.sources.forEach((source, index) => {
      cpSync(source, operation.targets[index], {
        recursive: true,
        errorOnExist: true,
        force: false,
        preserveTimestamps: true,
      });
      completedTargets.push(operation.targets[index]);
    });
    await recordOperation({
      operationId,
      tool: "copy-folder-items",
      folderPath: operation.folderPath,
      summary: `Copied ${operation.sources.length} item(s)`,
      actions: operation.targets.map((path) => ({ type: "remove", path })),
    });
    await showTaskSuccess(
      "Finder Command completed",
      `Copied ${operation.sources.length} item(s).`,
    );

    return {
      type: "success",
      folderPath: operation.folderPath,
      copied: operation.sources,
      targets: operation.targets,
      message: `Copied ${operation.sources.length} item(s):\n${operation.targets.join("\n")}`,
    };
  } catch (error) {
    for (const target of completedTargets.reverse()) {
      rmSync(target, { recursive: true, force: true });
    }
    if (operationId) cleanupJournalOperation(operationId);
    const message = formatFinderError(error);
    await showTaskFailure("Finder Command failed", message);

    return {
      type: "error",
      message,
    };
  }
}
