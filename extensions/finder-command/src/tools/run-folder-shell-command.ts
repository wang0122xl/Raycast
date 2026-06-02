import { Action, Tool } from "@raycast/api";
import { execFile } from "child_process";
import { promisify } from "util";
import { formatFinderError, getScopedFinderFolderPath } from "../finder";
import { ensureDirectory, truncateText } from "../path-utils";
import { showTaskFailure, showTaskSuccess } from "../toast-utils";

const execFileAsync = promisify(execFile);

type Input = {
  contextToken?: string;
  command: string;
  reason?: string;
  requiresAuthorization?: boolean;
  destructive?: boolean;
};

const BLOCKED_COMMAND_PATTERN =
  /(^|[;&|()\s])(sudo|rm|unlink|srm|shred|mkfs|diskutil\s+erase|dd)(\s|$)/i;
const SIDE_EFFECT_COMMAND_PATTERN =
  /(^|[;&|()\s])(mv|cp|chmod|chown|sed|perl|python|python3|node|mkdir|rmdir|touch|tee|tar|zip|unzip|rsync)(\s|$)|[>]{1,2}/i;

function validateCommand(command: string) {
  const trimmed = command.trim();
  if (!trimmed) {
    throw new Error("Command is required.");
  }

  if (BLOCKED_COMMAND_PATTERN.test(trimmed)) {
    throw new Error(
      "Permanent deletion or privileged disk commands are blocked. Use the trash-folder-items tool for deletion.",
    );
  }

  return trimmed;
}

function ensureReadOnlyCommand(input: Input, command: string) {
  if (
    input.requiresAuthorization ||
    input.destructive ||
    SIDE_EFFECT_COMMAND_PATTERN.test(command)
  ) {
    throw new Error(
      "Shell commands with file side effects are blocked because they cannot be safely undone. Use the dedicated copy, move, rename, number, or trash tools instead.",
    );
  }
}

export default async function RunFolderShellCommand(input: Input) {
  try {
    const folderPath = await getScopedFinderFolderPath(input.contextToken);
    ensureDirectory(folderPath);

    const command = validateCommand(input.command);
    ensureReadOnlyCommand(input, command);
    const { stdout, stderr } = await execFileAsync(
      "/bin/zsh",
      ["-lc", command],
      {
        cwd: folderPath,
        encoding: "utf-8",
        timeout: 120_000,
        maxBuffer: 1024 * 1024,
      },
    );
    await showTaskSuccess("Finder Command completed", "Command completed.");

    return {
      type: "success",
      folderPath,
      command,
      stdout: truncateText(stdout),
      stderr: truncateText(stderr),
      message: truncateText(
        [
          `Command completed in ${folderPath}`,
          stdout ? `\nstdout:\n${stdout}` : "",
          stderr ? `\nstderr:\n${stderr}` : "",
        ].join("\n"),
      ),
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

export const confirmation: Tool.Confirmation<Input> = async (input: Input) => {
  try {
    const command = validateCommand(input.command);
    ensureReadOnlyCommand(input, command);

    return undefined;
  } catch (error) {
    return {
      style: Action.Style.Destructive,
      message: formatFinderError(error),
    };
  }
};
