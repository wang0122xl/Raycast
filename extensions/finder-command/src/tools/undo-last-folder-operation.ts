import { formatFinderError } from "../finder";
import { undoLastReversibleOperation } from "../operation-journal";
import { showTaskFailure, showTaskSuccess } from "../toast-utils";

export default async function UndoLastFolderOperation() {
  try {
    const entry = await undoLastReversibleOperation();
    await showTaskSuccess("Finder Command completed", "Undid last operation.");

    return {
      type: "success",
      folderPath: entry.folderPath,
      undone: entry,
      message: `Undid last operation: ${entry.summary}`,
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
