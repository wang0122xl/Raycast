import { Action, ActionPanel, Icon, List, showToast, Toast } from "@raycast/api";
import { useState, useEffect, useCallback } from "react";
import { getFolders, addFolder, removeFolder, getCodeAgent, setCodeAgent, type CodeAgent } from "./storage";

export default function ManageFolders() {
  const [folders, setFolders] = useState<string[]>([]);
  const [agent, setAgent] = useState<CodeAgent>("claude");
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [f, a] = await Promise.all([getFolders(), getCodeAgent()]);
    setFolders(f);
    setAgent(a);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleSelectAgent(selected: CodeAgent) {
    await setCodeAgent(selected);
    setAgent(selected);
    await showToast({ style: Toast.Style.Success, title: `Code Agent: ${selected}` });
  }

  async function handleAddFolder() {
    const { execSync } = await import("child_process");
    try {
      const selected = execSync(
        `osascript -e 'POSIX path of (choose folder with prompt "Select a folder to scan")'`,
        { encoding: "utf-8", timeout: 30000 },
      ).trim();
      if (selected) {
        await addFolder(selected.replace(/\/$/, ""));
        await refresh();
        await showToast({ style: Toast.Style.Success, title: "Added", message: selected });
      }
    } catch {
      // user cancelled
    }
  }

  return (
    <List isLoading={isLoading}>
      <List.Section title="Code Agent">
        {(["claude", "codex", "opencode"] as const).map((a) => (
          <List.Item
            key={a}
            icon={a === agent ? Icon.CheckCircle : Icon.Circle}
            title={a}
            subtitle={a === agent ? "Active" : ""}
            actions={
              <ActionPanel>
                <Action title="Select" onAction={() => handleSelectAgent(a)} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
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
                    await showToast({ style: Toast.Style.Success, title: "Removed" });
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
    </List>
  );
}
