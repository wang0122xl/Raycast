import {
  Action,
  ActionPanel,
  Color,
  closeMainWindow,
  Icon,
  List,
  open,
  PopToRootType,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useState, useEffect, useCallback, useMemo } from "react";
import { getTasks, removeTask, updateTask, type Task } from "./storage";
import {
  getTaskStatus,
  getSkillOptionsForCommand,
  launchTask,
  readTaskOutput,
  stopTask,
} from "./task-manager";
import { extractGitUrl, extractReviewReport, TaskDetail } from "./task-detail";

function getTaskIcon(status: Task["status"]) {
  switch (status) {
    case "running":
      return Icon.CircleProgress;
    case "completed":
      return Icon.CheckCircle;
    case "stopped":
    case "canceled":
      return Icon.Stop;
    case "failed":
      return Icon.XMarkCircle;
  }
}

function getStatusLabel(status: Task["status"]): string {
  switch (status) {
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "stopped":
    case "canceled":
      return "canceled";
  }
}

function getStatusColor(status: Task["status"]): Color {
  switch (status) {
    case "running":
      return Color.Blue;
    case "completed":
      return Color.Green;
    case "failed":
      return Color.Red;
    case "stopped":
    case "canceled":
      return Color.Orange;
  }
}

function formatTaskStartTime(startTime: number): string {
  const date = new Date(startTime);
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    " ",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
  ].join("");
}

function taskMatchesSearch(task: Task, searchText: string): boolean {
  const query = searchText.trim().toLowerCase();
  if (!query) return true;

  return [
    task.label,
    task.command,
    task.dir,
    task.branch,
    task.targetBranch,
    task.prUrl,
    getStatusLabel(task.status),
    formatTaskStartTime(task.startTime),
  ]
    .filter(Boolean)
    .some((value) => value.toLowerCase().includes(query));
}

export default function ViewTasks() {
  const { push } = useNavigation();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const t = await getTasks();
    const updated = await Promise.all(
      t.map(async (task) => {
        const status = getTaskStatus(task);
        if (status !== task.status) {
          await updateTask(task.id, { status });
          return { ...task, status };
        }
        return task;
      }),
    );
    const sorted = [...updated].sort((a, b) => b.startTime - a.startTime);
    setTasks(sorted);
    setIsLoading(false);
    return sorted;
  }, []);

  const handleStop = useCallback(
    async (task: Task) => {
      await showToast({
        style: Toast.Style.Animated,
        title: "Stopping task...",
      });
      await stopTask(task);
      await refresh();
      await showToast({ style: Toast.Style.Success, title: "Task canceled" });
    },
    [refresh],
  );

  const handleRemove = useCallback(
    async (task: Task) => {
      await removeTask(task.id);
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    let timer: NodeJS.Timeout | undefined;
    let isActive = true;

    async function poll() {
      const updated = await refresh();
      if (!isActive) return;

      const hasRunning = updated.some((t) => t.status === "running");
      timer = setTimeout(poll, hasRunning ? 3000 : 30000);
    }

    void poll();

    return () => {
      isActive = false;
      if (timer) clearTimeout(timer);
    };
  }, [refresh]);

  const visibleTasks = useMemo(
    () => tasks.filter((task) => taskMatchesSearch(task, searchText)),
    [searchText, tasks],
  );
  const hasSearch = searchText.trim().length > 0;
  const running = visibleTasks.filter((t) => t.status === "running");
  const finished = visibleTasks.filter((t) => t.status !== "running");

  function renderTaskItem(task: Task) {
    const output = task.status === "completed" ? readTaskOutput(task) : "";
    const gitUrl =
      task.status === "completed" ? extractGitUrl(task, output) : null;
    const reviewReport =
      task.status === "completed" && task.command === "review-pr"
        ? extractReviewReport(output)
        : null;

    function handleRerunReview() {
      if (!task.prUrl) return;
      void (async () => {
        const toast = await showToast({
          style: Toast.Style.Animated,
          title: "Re-running review...",
        });
        try {
          const skillOpts = await getSkillOptionsForCommand("review-pr");
          const newTask = await launchTask("review-pr", task.dir, task.label, {
            prUrl: task.prUrl,
            ...skillOpts,
          });
          if (!newTask) {
            toast.style = Toast.Style.Failure;
            toast.title = "No skill file configured";
            toast.message =
              "Please configure one via Manage Folders&Skills&Agents";
            return;
          }
          toast.style = Toast.Style.Success;
          toast.title = "PR review task started";
          push(<TaskDetail task={newTask} onRerunReview={handleRerunReview} />);
        } catch (error) {
          toast.style = Toast.Style.Failure;
          toast.title = "Failed to start PR review";
          toast.message =
            error instanceof Error ? error.message : String(error);
        }
      })();
    }

    return (
      <List.Item
        key={task.id}
        icon={getTaskIcon(task.status)}
        title={task.label}
        subtitle={task.dir}
        accessories={[
          ...(reviewReport ? [{ icon: Icon.Document, text: "Report" }] : []),
          {
            text: {
              value: getStatusLabel(task.status),
              color: getStatusColor(task.status),
            },
          },
          { text: formatTaskStartTime(task.startTime) },
        ]}
        actions={
          <ActionPanel>
            <Action
              title="View Details"
              icon={Icon.Eye}
              onAction={() =>
                push(
                  <TaskDetail
                    task={task}
                    allowClear
                    onRerunReview={
                      task.command === "review-pr" && task.prUrl
                        ? handleRerunReview
                        : undefined
                    }
                  />,
                )
              }
            />
            {task.status === "running" && (
              <Action
                title="Stop Task"
                icon={Icon.Stop}
                style={Action.Style.Destructive}
                shortcut={{ modifiers: ["cmd"], key: "." }}
                onAction={() => void handleStop(task)}
              />
            )}
            {gitUrl && (
              <>
                <Action.CopyToClipboard
                  title="Copy Git Link"
                  content={gitUrl}
                  shortcut={{ modifiers: ["cmd"], key: "enter" }}
                />
                <Action
                  title="Open Git Link"
                  icon={Icon.Link}
                  shortcut={{ modifiers: ["cmd"], key: "o" }}
                  onAction={() => {
                    void open(gitUrl);
                    void closeMainWindow({
                      clearRootSearch: true,
                      popToRootType: PopToRootType.Immediate,
                    });
                  }}
                />
              </>
            )}
            {task.prUrl && !gitUrl && (
              <>
                <Action.CopyToClipboard
                  title="Copy Pr Link"
                  content={task.prUrl}
                  shortcut={{ modifiers: ["cmd"], key: "enter" }}
                />
                <Action
                  title="Open Pr Link"
                  icon={Icon.Link}
                  shortcut={{ modifiers: ["cmd"], key: "o" }}
                  onAction={() => {
                    void open(task.prUrl!);
                    void closeMainWindow({
                      clearRootSearch: true,
                      popToRootType: PopToRootType.Immediate,
                    });
                  }}
                />
              </>
            )}
            {task.status !== "running" && (
              <Action
                title="Remove"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                shortcut={{ modifiers: ["cmd"], key: "d" }}
                onAction={() => void handleRemove(task)}
              />
            )}
          </ActionPanel>
        }
      />
    );
  }

  return (
    <List
      isLoading={isLoading}
      filtering={false}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search tasks..."
    >
      {hasSearch && visibleTasks.length > 0 && (
        <List.Section title="Results">
          {visibleTasks.map(renderTaskItem)}
        </List.Section>
      )}
      {!hasSearch && running.length > 0 && (
        <List.Section title="Running">
          {running.map(renderTaskItem)}
        </List.Section>
      )}
      {!hasSearch && finished.length > 0 && (
        <List.Section title="Finished">
          {finished.map(renderTaskItem)}
        </List.Section>
      )}
      {tasks.length === 0 && !isLoading && (
        <List.EmptyView
          title="No Tasks"
          description="Run git-push, create-pr, or review-pr to start a task"
        />
      )}
      {tasks.length > 0 && visibleTasks.length === 0 && !isLoading && (
        <List.EmptyView title="No Matching Tasks" />
      )}
    </List>
  );
}
