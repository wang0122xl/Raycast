import { formatFinderError } from "../finder";
import { undoLastReversibleOperation } from "../operation-journal";

export default async function UndoLastFolderOperation() {
  try {
    const entry = await undoLastReversibleOperation();

    return {
      type: "success",
      folderPath: entry.folderPath,
      undone: entry,
      message: `Undid last operation: ${entry.summary}`,
    };
  } catch (error) {
    return {
      type: "error",
      message: formatFinderError(error),
    };
  }
}
