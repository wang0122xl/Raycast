import { renameSync } from "fs";
import { formatFinderError } from "../finder";
import {
  cleanupJournalOperation,
  createJournalOperation,
  recordOperation,
  snapshotItems,
} from "../operation-journal";
import { showTaskFailure, showTaskSuccess } from "../toast-utils";
import { resolveRenameOperation } from "./file-operation-utils";
import { formatOperationMessage } from "./operation-output";

type Input = {
  /** The contextToken returned by get-front-finder-folder for this request, when available. */
  contextToken?: string;
  /** Relative or absolute path of the single file or folder to rename inside the locked Finder folder. */
  path: string;
  /** New file or folder name only, not a path. Use this for 重命名/改名/命名为/rename requests. */
  newName: string;
  reason?: string;
};

export default async function RenameFolderItem(input: Input) {
  let operationId: string | undefined;
  let completedRename: { source: string; target: string } | undefined;

  try {
    const operation = await resolveRenameOperation(input);
    operationId = await createJournalOperation("rename-folder-item");
    const restoreActions = snapshotItems({
      operationId,
      folderPath: operation.folderPath,
      paths: [operation.source],
    });

    renameSync(operation.source, operation.target);
    completedRename = { source: operation.source, target: operation.target };
    await recordOperation({
      operationId,
      tool: "rename-folder-item",
      folderPath: operation.folderPath,
      summary: `Renamed ${operation.source} to ${operation.target}`,
      actions: [
        {
          type: "remove",
          path: operation.target,
          sourcePath: operation.source,
        },
        ...restoreActions,
      ],
    });
    await showTaskSuccess("Finder Command completed", "Renamed 1 item.");

    return {
      type: "success",
      operation: "rename-folder-item",
      folderPath: operation.folderPath,
      renamed: operation.source,
      target: operation.target,
      affectedPaths: [{ path: operation.source, target: operation.target }],
      message: formatOperationMessage({
        operation: "重命名文件/目录 (rename-folder-item)",
        summary: "已重命名 1 项",
        affectedPaths: [{ path: operation.source, target: operation.target }],
      }),
    };
  } catch (error) {
    if (completedRename) {
      try {
        renameSync(completedRename.target, completedRename.source);
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
