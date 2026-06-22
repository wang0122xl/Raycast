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
import { formatOperationMessage } from "./operation-output";

type Input = {
  /** The contextToken returned by get-front-finder-folder for this request, when available. */
  contextToken?: string;
  /** Root-level directory name under the locked Finder folder to limit filtered matching. */
  sourceDirectory?: string;
  /** Newline-separated relative paths to move, when operating on specific files or folders. */
  paths?: string;
  /** Destination directory relative to the locked Finder folder. */
  destinationDirectory?: string;
  /** Optional new name when moving exactly one source item. */
  newName?: string;
  /** Filename or wildcard pattern to match, for example "*.pdf" or "invoice". */
  pattern?: string;
  /** File extension to match without a dot; for "PDF files", pass "pdf". */
  fileExtension?: string;
  /** Multiple file extensions to match without dots, separated by commas or newlines. */
  fileExtensions?: string;
  /** Maximum recursive depth. Omit this to scan all nested folders. */
  maxDepth?: number;
  /** Whether to include hidden dotfiles and dotfolders. */
  includeHidden?: boolean;
  /** Short reason for the file operation. */
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
      operation: "move-folder-items",
      folderPath: operation.folderPath,
      moved: operation.sources,
      targets: operation.targets,
      affectedPaths: operation.sources.map((source, index) => ({
        path: source,
        target: operation.targets[index],
      })),
      message: formatOperationMessage({
        operation: "移动文件/目录 (move-folder-items)",
        summary: `已移动 ${operation.sources.length} 项`,
        affectedPaths: operation.sources.map((source, index) => ({
          path: source,
          target: operation.targets[index],
        })),
      }),
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
