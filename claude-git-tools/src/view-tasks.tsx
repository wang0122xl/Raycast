import {
  Action,
  ActionPanel,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useState, useEffect, useCallback } from "react";
import { getTasks, removeTask, updateTask, type Task } from "./storage";
import { getTaskStatus, stopTask } from "./task-manager";
import { TaskDetail } from "./task-detail";

function getTaskIcon(status: Task["status"]) {
  switch (status) {
    case "running":
      return Icon.CircleProgress;
    case "completed":
      return Icon.CheckCircle;
    case "stopped":
      return Icon.Stop;
    case "failed":
      return Icon.XMarkCircle;
  }
}

export default function ViewTasks() {
  const { push } = useNavigation();
  const [tasks, setTasks] = useState<Task[]>([]);
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
    setTasks(updated);
    setIsLoading(false);
  }, []);

  const handleStop = useCallback(
    async (task: Task) => {
      await showToast({
        style: Toast.Style.Animated,
        title: "Stopping task...",
      });
      await stopTask(task);
      await refresh();
      await showToast({ style: Toast.Style.Success, title: "Task stopped" });
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
    refresh();
    const hasRunning = tasks.some((t) => t.status === "running");
    const interval = hasRunning ? 3000 : 30000;
    const timer = setInterval(refresh, interval);
    return () => clearInterval(timer);
  }, [refresh, tasks]);

  const running = tasks.filter((t) => t.status === "running");
  const finished = tasks.filter((t) => t.status !== "running");

  return (
    <List isLoading={isLoading}>
      {running.length > 0 && (
        <List.Section title="Running">
          {running.map((task) => (
            <List.Item
              key={task.id}
              icon={getTaskIcon(task.status)}
              title={task.label}
              subtitle={task.dir}
              accessories={[
                { text: new Date(task.startTime).toLocaleTimeString() },
              ]}
              actions={
                <ActionPanel>
                  <Action
                    title="View Details"
                    onAction={() => push(<TaskDetail task={task} allowClear />)}
                  />
                  <Action
                    title="Stop Task"
                    icon={Icon.Stop}
                    style={Action.Style.Destructive}
                    shortcut={{ modifiers: ["cmd"], key: "." }}
                    onAction={() => void handleStop(task)}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}
      {finished.length > 0 && (
        <List.Section title="Finished">
          {finished.map((task) => (
            <List.Item
              key={task.id}
              icon={getTaskIcon(task.status)}
              title={task.label}
              subtitle={task.dir}
              accessories={[
                { text: task.status },
                { text: new Date(task.startTime).toLocaleTimeString() },
              ]}
              actions={
                <ActionPanel>
                  <Action
                    title="View Details"
                    onAction={() => push(<TaskDetail task={task} allowClear />)}
                  />
                  <Action
                    title="Remove"
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    shortcut={{ modifiers: ["cmd"], key: "d" }}
                    onAction={() => void handleRemove(task)}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}
      {tasks.length === 0 && !isLoading && (
        <List.EmptyView
          title="No Tasks"
          description="Run git-push or create-pr to start a task"
        />
      )}
    </List>
  );
}
