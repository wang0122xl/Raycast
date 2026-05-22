import {
  Action,
  ActionPanel,
  Icon,
  List,
  showToast,
  Toast,
} from "@raycast/api";
import { useState, useEffect, useCallback } from "react";
import {
  getFolders,
  addFolder,
  removeFolder,
  getSkillPath,
  setSkillPath,
  removeSkillPath,
  getAgentForCommand,
  setAgentForCommand,
  type Agent,
  type SkillCommand,
} from "./storage";
import { pickSkillFile } from "./skill-picker";
import { pickFolderDialog } from "./git-utils";

const SKILL_COMMANDS: { command: SkillCommand; label: string }[] = [
  { command: "git-push", label: "Git Push" },
  { command: "create-pr", label: "Create PR" },
  { command: "review-pr", label: "Review PR" },
];

const AGENTS: { value: Agent; label: string }[] = [
  { value: "claude", label: "Claude" },
  { value: "codex", label: "Codex" },
  { value: "opencode", label: "OpenCode" },
  { value: "gemini", label: "Gemini" },
];

export default function ManageFolders() {
  const [folders, setFolders] = useState<string[]>([]);
  const [skills, setSkills] = useState<Record<SkillCommand, string | null>>({
    "git-push": null,
    "create-pr": null,
    "review-pr": null,
  });
  const [agents, setAgents] = useState<Record<SkillCommand, Agent>>({
    "git-push": "claude",
    "create-pr": "claude",
    "review-pr": "claude",
  });
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [f, gp, cp, rp, gitPushAgent, createPrAgent, reviewPrAgent] =
      await Promise.all([
        getFolders(),
        getSkillPath("git-push"),
        getSkillPath("create-pr"),
        getSkillPath("review-pr"),
        getAgentForCommand("git-push"),
        getAgentForCommand("create-pr"),
        getAgentForCommand("review-pr"),
      ]);
    setFolders(f);
    setSkills({ "git-push": gp, "create-pr": cp, "review-pr": rp });
    setAgents({
      "git-push": gitPushAgent,
      "create-pr": createPrAgent,
      "review-pr": reviewPrAgent,
    });
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleAddFolder() {
    const selected = await pickFolderDialog();
    if (selected) {
      await addFolder(selected);
      await refresh();
      await showToast({
        style: Toast.Style.Success,
        title: "Added",
        message: selected,
      });
    }
  }

  return (
    <List isLoading={isLoading}>
      <List.Section title="Configured Folders">
        {folders.map((f) => (
          <List.Item
            key={f}
            icon={Icon.Folder}
            title={f}
            actions={
              <ActionPanel>
                <Action
                  title="Remove"
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  onAction={async () => {
                    await removeFolder(f);
                    await refresh();
                    await showToast({
                      style: Toast.Style.Success,
                      title: "Removed",
                    });
                  }}
                />
                <Action
                  title="Add Folder"
                  icon={Icon.Plus}
                  shortcut={{ modifiers: ["cmd"], key: "n" }}
                  onAction={handleAddFolder}
                />
              </ActionPanel>
            }
          />
        ))}
        {folders.length === 0 && (
          <List.Item
            icon={Icon.Plus}
            title="Add Folder"
            subtitle="Press Enter to select a folder"
            actions={
              <ActionPanel>
                <Action
                  title="Add Folder"
                  icon={Icon.Plus}
                  onAction={handleAddFolder}
                />
              </ActionPanel>
            }
          />
        )}
      </List.Section>
      <List.Section title="Skills">
        {SKILL_COMMANDS.map(({ command, label }) => {
          const path = skills[command];
          return (
            <List.Item
              key={command}
              icon={path ? Icon.Document : Icon.QuestionMarkCircle}
              title={label}
              accessories={[{ text: path || "Not configured" }]}
              actions={
                <ActionPanel>
                  <Action
                    title="Select Skill File"
                    icon={Icon.Document}
                    onAction={async () => {
                      const selected = await pickSkillFile(label);
                      if (selected) {
                        await setSkillPath(command, selected);
                        await refresh();
                        await showToast({
                          style: Toast.Style.Success,
                          title: "Skill configured",
                        });
                      }
                    }}
                  />
                  {path && (
                    <Action
                      title="Remove Skill"
                      icon={Icon.Trash}
                      style={Action.Style.Destructive}
                      shortcut={{ modifiers: ["cmd"], key: "d" }}
                      onAction={async () => {
                        await removeSkillPath(command);
                        await refresh();
                        await showToast({
                          style: Toast.Style.Success,
                          title: "Skill removed",
                        });
                      }}
                    />
                  )}
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
      <List.Section title="Agent">
        {SKILL_COMMANDS.map(({ command, label }) => {
          const selectedAgent = agents[command];
          const selectedAgentLabel =
            AGENTS.find((item) => item.value === selectedAgent)?.label ||
            "Claude";
          return (
            <List.Item
              key={command}
              icon={Icon.Terminal}
              title={`Agent - ${label}`}
              accessories={[{ text: selectedAgentLabel }]}
              actions={
                <ActionPanel>
                  {AGENTS.map(({ value, label: agentLabel }) => (
                    <Action
                      key={value}
                      title={`Select ${agentLabel}`}
                      icon={
                        selectedAgent === value ? Icon.CheckCircle : Icon.Circle
                      }
                      onAction={async () => {
                        await setAgentForCommand(command, value);
                        await refresh();
                        await showToast({
                          style: Toast.Style.Success,
                          title: "Agent selected",
                          message: `${label}: ${agentLabel}`,
                        });
                      }}
                    />
                  ))}
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
    </List>
  );
}
