import { showToast, Toast, useNavigation } from "@raycast/api";
import { getCodeAgent } from "./storage";
import { launchTask } from "./task-manager";
import { TaskDetail } from "./task-detail";
import { RepoPicker } from "./repo-picker";

export default function GitPush() {
  const { push } = useNavigation();

  async function handleSelect(fullPath: string) {
    const agent = await getCodeAgent();
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Starting git push...",
    });
    try {
      const task = await launchTask(
        agent,
        "git-push",
        "/git-push-changes",
        fullPath,
        "git push",
      );
      toast.style = Toast.Style.Success;
      toast.title = "Git push task started";
      push(<TaskDetail task={task} />);
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to start git push";
      toast.message = error instanceof Error ? error.message : String(error);
    }
  }

  return <RepoPicker primaryActionTitle="Git Push" onSelect={handleSelect} />;
}
