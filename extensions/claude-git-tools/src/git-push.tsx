import { showToast, Toast, useNavigation } from "@raycast/api";
import { launchTask } from "./task-manager";
import { TaskDetail } from "./task-detail";
import { SkillRepoPicker, type SkillConfig } from "./skill-picker";

export default function GitPush() {
  const { push } = useNavigation();

  async function handleSelect(fullPath: string, skill: SkillConfig) {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Starting git push...",
    });
    try {
      const task = await launchTask("git-push", fullPath, "git push", {
        skillPath: skill.skillPath,
        skillName: skill.skillName,
        skillDir: skill.skillDir,
        agent: skill.agent,
      });
      if (!task) {
        toast.style = Toast.Style.Failure;
        toast.title = "No skill file configured";
        toast.message = "Please configure one via Manage Folders&Skills&Agents";
        return;
      }
      toast.style = Toast.Style.Success;
      toast.title = "Git push task started";
      push(<TaskDetail task={task} />);
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to start git push";
      toast.message = error instanceof Error ? error.message : String(error);
    }
  }

  return (
    <SkillRepoPicker
      command="git-push"
      primaryActionTitle="Git Push"
      onSelect={handleSelect}
    />
  );
}
