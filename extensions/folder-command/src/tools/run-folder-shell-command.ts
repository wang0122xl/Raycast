import { Action, Tool } from "@raycast/api";
import { execFile } from "child_process";
import { promisify } from "util";
import { formatFinderError, getFrontFinderFolderPath } from "../finder";
import { ensureDirectory, truncateText } from "../path-utils";

const execFileAsync = promisify(execFile);

type Input = {
  command: string;
  reason?: string;
  destructive?: boolean;
};

const BLOCKED_COMMAND_PATTERN =
  /(^|[;&|()\s])(sudo|rm|unlink|srm|shred|mkfs|diskutil\s+erase|dd)(\s|$)/i;

function isDestructiveCommand(command: string, destructive?: boolean) {
  return (
    Boolean(destructive) ||
    /\b(mv|cp|chmod|chown|sed|perl|python|node|mkdir|rmdir|touch)\b/.test(
      command,
    )
  );
}

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

export default async function RunFolderShellCommand(input: Input) {
  try {
    const folderPath = await getFrontFinderFolderPath();
    ensureDirectory(folderPath);

    const command = validateCommand(input.command);
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
    return {
      type: "error",
      message: formatFinderError(error),
    };
  }
}

export const confirmation: Tool.Confirmation<Input> = async (input: Input) => {
  try {
    const folderPath = await getFrontFinderFolderPath();
    const command = validateCommand(input.command);

    return {
      style: isDestructiveCommand(command, input.destructive)
        ? Action.Style.Destructive
        : Action.Style.Regular,
      message: "Run this shell command in the front Finder folder?",
      info: [
        { name: "Finder Folder", value: folderPath },
        { name: "Command", value: command },
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
