import { renameSync } from "fs";
import { formatFinderError } from "../finder";
import {
  cleanupJournalOperation,
  createJournalOperation,
  recordOperation,
  snapshotItems,
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

export default async function MoveFolderItems(input: Input) {
  let operationId: string | undefined;
  const completedMoves: Array<{ source: string; target: string }> = [];

  try {
    const operation = await resolveFileOperation(input);
    operationId = await createJournalOperation("move-folder-items");
    const restoreActions = snapshotItems({
      operationId,
      folderPath: operation.folderPath,
      paths: operation.sources,
    });

    operation.sources.forEach((source, index) => {
      renameSync(source, operation.targets[index]);
      completedMoves.push({ source, target: operation.targets[index] });
    });
    await recordOperation({
      operationId,
      tool: "move-folder-items",
      folderPath: operation.folderPath,
      summary: `Moved ${operation.sources.length} item(s)`,
      actions: [
        ...operation.targets.map((path, index) => ({
          type: "remove" as const,
          path,
          sourcePath: operation.sources[index],
        })),
        ...restoreActions,
      ],
    });
    await showTaskSuccess(
      "Finder Command completed",
      `Moved ${operation.sources.length} item(s).`,
    );

    return {
      type: "success",
      folderPath: operation.folderPath,
      moved: operation.sources,
      targets: operation.targets,
      message: `Moved ${operation.sources.length} item(s):\n${operation.targets.join("\n")}`,
    };
  } catch (error) {
    for (const move of completedMoves.reverse()) {
      try {
        renameSync(move.target, move.source);
      } catch {
        // Best-effort rollback for partial failures.
      }
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
