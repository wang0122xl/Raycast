import {
  Action,
  ActionPanel,
  closeMainWindow,
  confirmAlert,
  Icon,
  List,
  PopToRootType,
  showToast,
  Toast,
} from "@raycast/api";
import { execFile } from "child_process";
import { useCallback, useEffect, useState } from "react";
import { promisify } from "util";
import { toFolderListItem, type FolderListItem } from "./folder-list";
import {
  addProjectFolders,
  getProjectFolders,
  moveProjectFolderToTop,
  removeProjectFolder,
} from "./storage";
import { openZedProject, type ZedPanel } from "./zed";

const execFileAsync = promisify(execFile);

const CHOOSE_FOLDERS_SCRIPT = `
(() => {
  const app = Application.currentApplication();
  app.includeStandardAdditions = true;

  function posixPath(path) {
    const value = String(path);
    if (!value.startsWith("file://")) return value;
    return decodeURIComponent(value.replace(/^file:\\/\\//, ""));
  }

  try {
    const selected = app.chooseFolder({
      withPrompt: "Select project folders or .APP bundles",
      multipleSelectionsAllowed: true,
      showingPackageContents: true,
    });
    const values = Array.isArray(selected) ? selected : [selected];
    return values.map(posixPath).join("\\n");
  } catch (error) {
    if (String(error).includes("User canceled")) return "";
    throw error;
  }
})();
`;

async function chooseProjectFolders(): Promise<string[]> {
  const { stdout } = await execFileAsync(
    "osascript",
    ["-l", "JavaScript", "-e", CHOOSE_FOLDERS_SCRIPT],
    { timeout: 120_000 },
  );

  return stdout
    .split("\n")
    .map((path) => path.trim())
    .filter(Boolean);
}

export default function CodeOpen() {
  const [folders, setFolders] = useState<FolderListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const projectFolders = await getProjectFolders();
    setFolders(projectFolders.map(toFolderListItem));
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleAddFolders() {
    let selectedFolders: string[];

    try {
      selectedFolders = await chooseProjectFolders();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to choose folders",
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    if (selectedFolders.length === 0) return;

    const added = await addProjectFolders(selectedFolders);
    await refresh();

    if (added.length === 0) {
      await showToast({
        style: Toast.Style.Failure,
        title: "No folders added",
        message: "Select folders or .APP bundles that are not already saved.",
      });
      return;
    }

    await showToast({
      style: Toast.Style.Success,
      title:
        added.length === 1 ? "Folder added" : `${added.length} folders added`,
    });
  }

  async function showEmptyListHint() {
    await showToast({
      style: Toast.Style.Success,
      title: "Press Cmd+N to choose folders",
    });
  }

  function closeRaycastPanel() {
    void closeMainWindow({
      clearRootSearch: true,
      popToRootType: PopToRootType.Immediate,
    }).catch(() => undefined);
  }

  async function handleOpenFolder(folder: FolderListItem, panel: ZedPanel) {
    const started = openZedProject(folder.path, { panel });
    if (!started) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to start Zed",
        message: folder.path,
      });
      return;
    }

    await moveProjectFolderToTop(folder.path);
    closeRaycastPanel();
  }

  async function handleRemoveFolder(folder: FolderListItem) {
    const confirmed = await confirmAlert({
      title: "Remove Project Folder?",
      message: folder.path,
      primaryAction: {
        title: "Remove",
        style: Action.Style.Destructive,
      },
    });

    if (!confirmed) return;

    await removeProjectFolder(folder.path);
    await refresh();
    await showToast({
      style: Toast.Style.Success,
      title: "Folder removed",
      message: folder.title,
    });
  }

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search project folders">
      {folders.length === 0 && !isLoading ? (
        <List.EmptyView
          icon={Icon.Folder}
          title="No Project Folders"
          description="Press Cmd+N to choose folders or .APP bundles."
          actions={
            <ActionPanel>
              <Action
                title="Show Add Folders Shortcut"
                icon={Icon.Info}
                onAction={showEmptyListHint}
              />
              <Action
                title="Add Folders"
                icon={Icon.Plus}
                shortcut={{ modifiers: ["cmd"], key: "n" }}
                onAction={handleAddFolders}
              />
            </ActionPanel>
          }
        />
      ) : (
        folders.map((folder) => (
          <List.Item
            id={folder.path}
            key={folder.path}
            icon={Icon.Folder}
            title={folder.title}
            subtitle={folder.subtitle}
            keywords={folder.keywords}
            actions={
              <ActionPanel>
                <Action
                  title="Open Zed Project Panel"
                  icon={Icon.ArrowRight}
                  onAction={() => handleOpenFolder(folder, "project")}
                />
                <Action
                  title="Open Zed Git Panel"
                  icon={Icon.Code}
                  onAction={() => handleOpenFolder(folder, "git")}
                />
                <Action
                  title="Add Folders"
                  icon={Icon.Plus}
                  shortcut={{ modifiers: ["cmd"], key: "n" }}
                  onAction={handleAddFolders}
                />
                <Action
                  title="Remove Folder"
                  icon={Icon.XMarkCircle}
                  style={Action.Style.Destructive}
                  shortcut={{ modifiers: ["cmd"], key: "x" }}
                  onAction={() => handleRemoveFolder(folder)}
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
