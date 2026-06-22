import { formatFinderError } from "../finder";
import { undoLastReversibleOperation } from "../operation-journal";
import { showTaskFailure, showTaskSuccess } from "../toast-utils";
import { formatOperationMessage } from "./operation-output";

export default async function UndoLastFolderOperation() {
  try {
    const entry = await undoLastReversibleOperation();
    await showTaskSuccess("Finder Command completed", "Undid last operation.");

    return {
      type: "success",
      operation: "undo-last-folder-operation",
      folderPath: entry.folderPath,
      undone: entry,
      affectedPaths: entry.actions.map((action) => ({
        path: action.path,
        target: action.type === "remove" ? action.sourcePath : undefined,
      })),
      message: formatOperationMessage({
        operation: "撤回上次操作 (undo-last-folder-operation)",
        summary: entry.summary,
        affectedPaths: entry.actions.map((action) => ({
          path: action.path,
          target: action.type === "remove" ? action.sourcePath : undefined,
        })),
      }),
    };
  } catch (error) {
    const message = formatFinderError(error);
    await showTaskFailure("Finder Command failed", message);

    return {
      type: "error",
      message,
    };
  }
}
