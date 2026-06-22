import { cpSync, rmSync } from "fs";
import { formatFinderError } from "../finder";
import {
  cleanupJournalOperation,
  createJournalOperation,
  recordOperation,
} from "../operation-journal";
import { showTaskFailure, showTaskSuccess } from "../toast-utils";
import { resolveFileOperation } from "./file-operation-utils";
import { formatOperationMessage } from "./operation-output";

type Input = {
  /** The contextToken returned by get-front-finder-folder for this request, when available. */
  contextToken?: string;
  /** Root-level directory name under the locked Finder folder to limit filtered matching. */
  sourceDirectory?: string;
  /** Newline-separated relative paths to copy, when operating on specific files or folders. */
  paths?: string;
  /** Destination directory relative to the locked Finder folder. */
  destinationDirectory?: string;
  /** Optional new name when copying exactly one source item. */
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
      operation: "copy-folder-items",
      folderPath: operation.folderPath,
      copied: operation.sources,
      targets: operation.targets,
      affectedPaths: operation.sources.map((source, index) => ({
        path: source,
        target: operation.targets[index],
      })),
      message: formatOperationMessage({
        operation: "复制文件/目录 (copy-folder-items)",
        summary: `已复制 ${operation.sources.length} 项`,
        affectedPaths: operation.sources.map((source, index) => ({
          path: source,
          target: operation.targets[index],
        })),
      }),
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
