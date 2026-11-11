import {
  Action,
  ActionPanel,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import {
  getAgentForCommand,
  getSkillPath,
  setSkillPath,
  type Agent,
  type SkillCommand,
} from "./storage";
import { skillPathToName } from "./task-manager";
import { dirFromPath } from "./git-utils";
import { RepoPicker } from "./repo-picker";

const COMMAND_LABELS: Record<SkillCommand, string> = {
  "git-push": "Git Push",
  "create-pr": "Create PR",
  "review-pr": "Review PR",
};

async function pickSkillFile(commandLabel?: string): Promise<string | null> {
  const { execFileSync } = await import("child_process");
  const { existsSync } = await import("fs");
  const { homedir } = await import("os");
  const { join } = await import("path");

  const home = homedir();
  const claudeDir = join(home, ".claude");
  const defaultDir = existsSync(claudeDir) ? claudeDir : home;
  const prompt = commandLabel
    ? `Select a .md skill file for ${commandLabel}`
    : "Select a .md skill file";

  try {
    const script = `
on run argv
  set dialogPrompt to item 1 of argv
  set defaultDir to POSIX file (item 2 of argv)
  return POSIX path of (choose file with prompt dialogPrompt of type {"md"} default location defaultDir)
end run
`;
    const selected = execFileSync(
      "osascript",
      ["-e", script, prompt, defaultDir],
      {
        encoding: "utf-8",
        timeout: 30000,
      },
    ).trim();
    return selected || null;
  } catch {
    return null;
  }
}

export { pickSkillFile };

export interface SkillConfig {
  skillPath: string;
  skillName: string;
  skillDir: string;
  agent: Agent;
}

interface SkillRepoPickerProps {
  command: SkillCommand;
  primaryActionTitle: string;
  onSelect: (dirPath: string, config: SkillConfig) => void | Promise<void>;
}

export function SkillRepoPicker({
  command,
  primaryActionTitle,
  onSelect,
}: SkillRepoPickerProps) {
  const { push, pop } = useNavigation();

  async function handleSelect(dirPath: string) {
    try {
      const [path, agent] = await Promise.all([
        getSkillPath(command, dirPath),
        getAgentForCommand(command),
      ]);
      if (path) {
        await onSelect(dirPath, skillPathToConfig(path, agent));
        return;
      }
      push(
        <SkillPrompt
          command={command}
          onConfigured={async (config) => {
            pop();
            await onSelect(dirPath, config);
          }}
        />,
      );
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to load skill",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <RepoPicker
      primaryActionTitle={primaryActionTitle}
      onSelect={handleSelect}
    />
  );
}

function skillPathToConfig(path: string, agent: Agent): SkillConfig {
  const name = skillPathToName(path);
  const dir = dirFromPath(path);
  return { skillPath: path, skillName: name, skillDir: dir, agent };
}

function SkillPrompt({
  command,
  onConfigured,
}: {
  command: SkillCommand;
  onConfigured: (config: SkillConfig) => void | Promise<void>;
}) {
  const label = COMMAND_LABELS[command];

  async function handleSelect() {
    const path = await pickSkillFile(label);
    if (!path) return;

    const name = skillPathToName(path);
    if (!name) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Invalid skill file",
      });
      return;
    }

    try {
      await setSkillPath(command, path);
      await showToast({
        style: Toast.Style.Success,
        title: `Skill configured: /${name}`,
      });
      await onConfigured(
        skillPathToConfig(path, await getAgentForCommand(command)),
      );
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to configure skill",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <List>
      <List.EmptyView
        icon={Icon.Document}
        title={`No Skill File for ${label}`}
        description="Press Enter to select a .md skill file"
        actions={
          <ActionPanel>
            <Action
              title="Select Skill File"
              icon={Icon.Document}
              onAction={handleSelect}
            />
          </ActionPanel>
        }
      />
    </List>
  );
}
