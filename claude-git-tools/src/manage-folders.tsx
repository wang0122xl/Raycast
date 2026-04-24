import {
  Action,
  ActionPanel,
  Icon,
  List,
  showToast,
  Toast,
} from "@raycast/api";
import { useState, useEffect, useCallback } from "react";
import { getFolders, addFolder, removeFolder } from "./storage";

export default function ManageFolders() {
  const [folders, setFolders] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setFolders(await getFolders());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
        await showToast({
          style: Toast.Style.Success,
          title: "Added",
          message: selected,
        });
      }
    } catch {
      // user cancelled
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
    </List>
  );
}
