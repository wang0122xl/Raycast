import {
  Action,
  ActionPanel,
  closeMainWindow,
  Detail,
  Icon,
  PopToRootType,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useCallback, useEffect, useState } from "react";
import { removeTask, updateTask, type Task } from "./storage";
import { getTaskStatus, readTaskOutput, stopTask } from "./task-manager";

const REFRESH_INTERVAL_MS = 1000;
const LATEST_OUTPUT_LINE_LIMIT = 6;
const EMPTY_OUTPUT_TEXT = "(waiting for output...)";

function getStatusLabel(status: Task["status"]): string {
  switch (status) {
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "stopped":
      return "Stopped";
  }
}

function escapeCodeFence(text: string): string {
  return text.replace(/```/g, "'''");
}

function getOutputText(output: string): string {
  const trimmedOutput = output.trimEnd();
  return trimmedOutput || EMPTY_OUTPUT_TEXT;
}

function getLatestOutputText(output: string): string {
  const lines = output
    .trimEnd()
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return EMPTY_OUTPUT_TEXT;
  }

  return lines.slice(-LATEST_OUTPUT_LINE_LIMIT).join("\n");
}

function formatDiffBlock(text: string): string {
  return `\`\`\`diff\n${escapeCodeFence(text)}\n\`\`\``;
}

function formatStatusLine(status: Task["status"]): string {
  const prefix = status === "running" ? "+" : "-";
  return `${prefix} status: ${getStatusLabel(status)}`;
}

function formatMetadataLine(task: Task): string {
  const elapsed = Math.round((Date.now() - task.startTime) / 1000);
  const parts = [`branch: ${task.branch || "unknown"}`];

  if (task.targetBranch) {
    parts.push(`target: ${task.targetBranch}`);
  }

  parts.push(`dir: ${task.dir}`, `elapsed: ${elapsed}s`);

  return parts.join(" | ");
}

function formatTerminalMarkdown(
  task: Task,
  status: Task["status"],
  output: string,
): string {
  const lines = [
    task.label,
    formatStatusLine(status),
    formatMetadataLine(task),
  ];
  const blocks = [formatDiffBlock(lines.join("\n"))];

  if (status === "running") {
    blocks.push(formatDiffBlock(getLatestOutputText(output)));
  }

  blocks.push(formatDiffBlock(getOutputText(output)));

  return blocks.join("\n\n");
}

export function TaskDetail({
  task,
  allowClear = false,
}: {
  task: Task;
  allowClear?: boolean;
}) {
  const { pop } = useNavigation();
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState<Task["status"]>(task.status);

  const refresh = useCallback(async () => {
    const taskWithCurrentStatus = { ...task, status };
    const nextOutput = readTaskOutput(task);
    const nextStatus = getTaskStatus(taskWithCurrentStatus);

    setOutput(nextOutput);

    if (nextStatus !== status) {
      setStatus(nextStatus);
      await updateTask(task.id, { status: nextStatus });
    }
  }, [status, task]);

  useEffect(() => {
    void refresh();
    if (status !== "running") return;
    const timer = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  async function handleStop() {
    await showToast({ style: Toast.Style.Animated, title: "Stopping task..." });
    await stopTask({ ...task, status });
    setStatus("stopped");
    setOutput(readTaskOutput(task));
    await showToast({ style: Toast.Style.Success, title: "Task stopped" });
  }

  async function handleClear() {
    await removeTask(task.id);
    pop();
  }

  async function handleCloseMainWindow() {
    await closeMainWindow({
      clearRootSearch: true,
      popToRootType: PopToRootType.Immediate,
    });
  }

  const running = status === "running";
  const markdown = formatTerminalMarkdown(task, status, output);

  return (
    <Detail
      markdown={markdown}
      navigationTitle={task.label}
      actions={
        <ActionPanel>
          <Action
            title="Close Raycast"
            icon={Icon.Window}
            onAction={() => void handleCloseMainWindow()}
          />
          <Action.CopyToClipboard
            title="Copy Output"
            content={output}
            shortcut={{ modifiers: ["cmd"], key: "enter" }}
          />
          <Action
            title="Refresh"
            icon={Icon.ArrowClockwise}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
            onAction={() => void refresh()}
          />
          {running && (
            <Action
              title="Stop Task"
              icon={Icon.Stop}
              style={Action.Style.Destructive}
              shortcut={{ modifiers: ["cmd"], key: "." }}
              onAction={() => void handleStop()}
            />
          )}
          {allowClear && !running && (
            <Action
              title="Clear Task & Back"
              icon={Icon.Trash}
              style={Action.Style.Destructive}
              onAction={() => void handleClear()}
            />
          )}
          <Action
            title="Back"
            icon={Icon.ArrowLeft}
            shortcut={{ modifiers: ["cmd"], key: "[" }}
            onAction={pop}
          />
        </ActionPanel>
      }
    />
  );
}
