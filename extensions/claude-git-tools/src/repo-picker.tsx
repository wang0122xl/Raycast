import {
  Action,
  ActionPanel,
  Alert,
  Color,
  Icon,
  List,
  confirmAlert,
  open,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useState, useEffect, useCallback } from "react";
import {
  getDirHistory,
  addDirHistory,
  addFolder,
  getHiddenRepos,
  hideRepo,
} from "./storage";
import {
  getAllGitRepos,
  getGitChangedFiles,
  getGitFileDiff,
  getGitWorkspaceStatus,
  pickFolderDialog,
  type GitChangedFile,
  type GitFileStatus,
  type GitWorkspaceStatus,
} from "./git-utils";
import { openZedGitPanel, openZedProject } from "./zed";

interface RepoPickerProps {
  primaryActionTitle: string;
  onSelect: (fullPath: string) => void;
}

const MIN_STATUS_LOADING_MS = 500;

export function RepoPicker({ primaryActionTitle, onSelect }: RepoPickerProps) {
  const { push } = useNavigation();
  const [searchText, setSearchText] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [repos, setRepos] = useState<
    { fullPath: string; displayName: string }[]
  >([]);
  const [statusByDir, setStatusByDir] = useState<
    Record<string, GitWorkspaceStatus | null>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [isStatusLoading, setIsStatusLoading] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const [h, r, hiddenRepos] = await Promise.all([
      getDirHistory(),
      getAllGitRepos(),
      getHiddenRepos(),
    ]);
    const hiddenRepoSet = new Set(hiddenRepos);
    const visibleHistory = h.filter((dir) => !hiddenRepoSet.has(dir));
    setHistory(visibleHistory);
    setRepos(r);
    setIsLoading(false);

    const dirs = [
      ...new Set([...visibleHistory, ...r.map((repo) => repo.fullPath)]),
    ];
    setStatusByDir({});
    if (dirs.length === 0) {
      setIsStatusLoading(false);
      return;
    }

    setIsStatusLoading(true);
    const statusLoadingStartedAt = Date.now();
    void Promise.all(
      dirs.map(async (dir) => [dir, await getGitWorkspaceStatus(dir)] as const),
    ).then((statuses) => {
      setStatusByDir(Object.fromEntries(statuses));
      const elapsed = Date.now() - statusLoadingStartedAt;
      const remaining = Math.max(0, MIN_STATUS_LOADING_MS - elapsed);
      setTimeout(() => setIsStatusLoading(false), remaining);
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const hasSearch = searchText.length > 0;
  const filteredRepos = hasSearch
    ? repos.filter(
        (r) =>
          r.displayName.toLowerCase().includes(searchText.toLowerCase()) ||
          r.fullPath.toLowerCase().includes(searchText.toLowerCase()),
      )
    : repos;
  const filteredHistory = hasSearch ? [] : history;

  async function handleSelect(fullPath: string) {
    await addDirHistory(fullPath);
    onSelect(fullPath);
  }

  function handleViewDiff(fullPath: string) {
    push(
      <RepoDiffPage
        dirPath={fullPath}
        primaryActionTitle={primaryActionTitle}
        onContinue={() => handleSelect(fullPath)}
      />,
    );
  }

  async function handleOpenInFinder(fullPath: string) {
    try {
      await open(fullPath);
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to open directory",
        message: error instanceof Error ? error.message : fullPath,
      });
    }
  }

  async function handleOpenInZed(fullPath: string) {
    const started = openZedProject(fullPath);
    if (!started) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to start Zed",
        message: fullPath,
      });
    }
  }

  async function handleAddFolder() {
    const selected = await pickFolderDialog();
    if (selected) {
      await addFolder(selected);
      await refresh();
      await showToast({
        style: Toast.Style.Success,
        title: "Folder added",
        message: selected,
      });
    }
  }

  async function handleRemoveFromList(fullPath: string) {
    const confirmed = await confirmAlert({
      title: "Remove this directory from the list?",
      message:
        "You will not be able to search this directory after removal. To show it again, add the folder again from the Manage Folders command.",
      primaryAction: {
        title: "Remove",
        style: Alert.ActionStyle.Destructive,
      },
      dismissAction: { title: "Cancel" },
    });
    if (!confirmed) return;

    await hideRepo(fullPath);
    await refresh();
    await showToast({
      style: Toast.Style.Success,
      title: "Removed from list",
      message: fullPath,
    });
  }

  async function handleRefreshScan() {
    await refresh();
    await showToast({
      style: Toast.Style.Success,
      title: "Scan refreshed",
    });
  }

  const noRepos = !isLoading && repos.length === 0 && history.length === 0;
  function getWorkspaceStatusAccessories(
    status: GitWorkspaceStatus | null | undefined,
  ): List.Item.Accessory[] {
    if (status === undefined) {
      return [
        {
          text: { value: "...", color: Color.SecondaryText },
          tooltip: "Loading workspace status",
        },
      ];
    }

    if (status === null) {
      return [
        {
          text: { value: "?", color: Color.SecondaryText },
          tooltip: "Workspace status unavailable",
        },
      ];
    }

    const accessories: List.Item.Accessory[] = [];

    if (status.conflicted > 0) {
      accessories.push({
        text: { value: `!${status.conflicted}`, color: Color.Red },
        tooltip: `${status.conflicted} conflicted file${status.conflicted === 1 ? "" : "s"}`,
      });
    }

    if (status.changed > 0) {
      accessories.push({
        text: { value: `M${status.changed}`, color: Color.Yellow },
        tooltip: `${status.changed} changed file${status.changed === 1 ? "" : "s"}`,
      });
    }

    if (status.untracked > 0) {
      accessories.push({
        text: { value: `U${status.untracked}`, color: Color.Blue },
        tooltip: `${status.untracked} untracked file${status.untracked === 1 ? "" : "s"}`,
      });
    }

    if (status.ahead > 0) {
      accessories.push({
        text: { value: `↑${status.ahead}`, color: Color.Purple },
        tooltip: `${status.ahead} commit${status.ahead === 1 ? "" : "s"} ahead`,
      });
    }

    if (status.behind > 0) {
      accessories.push({
        text: { value: `↓${status.behind}`, color: Color.Orange },
        tooltip: `${status.behind} commit${status.behind === 1 ? "" : "s"} behind`,
      });
    }

    if (accessories.length === 0) {
      accessories.push({
        text: { value: "✓", color: Color.Green },
        tooltip: "Clean workspace",
      });
    }

    return accessories;
  }

  function getBranchSubtitle(status: GitWorkspaceStatus | null | undefined) {
    if (status === undefined) return "(...)";
    if (status === null) return "(?)";
    return `(${status.branch})`;
  }

  return (
    <List
      isLoading={isLoading || isStatusLoading}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search repositories..."
    >
      {noRepos ? (
        <List.EmptyView
          icon={Icon.Folder}
          title="No Folders Configured"
          description="Press Enter to add a folder to scan for git repositories"
          actions={
            <ActionPanel>
              <Action
                title="Add Folder"
                icon={Icon.Plus}
                onAction={handleAddFolder}
              />
              <Action
                title="Refresh Scan"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
                onAction={handleRefreshScan}
              />
            </ActionPanel>
          }
        />
      ) : (
        <>
          {filteredHistory.length > 0 && (
            <List.Section title="Recent">
              {filteredHistory.map((dir) => {
                const display =
                  repos.find((r) => r.fullPath === dir)?.displayName || dir;
                return (
                  <List.Item
                    key={`recent-${dir}`}
                    icon={Icon.Clock}
                    title={display}
                    subtitle={getBranchSubtitle(statusByDir[dir])}
                    accessories={getWorkspaceStatusAccessories(
                      statusByDir[dir],
                    )}
                    actions={
                      <ActionPanel>
                        <Action
                          title={primaryActionTitle}
                          onAction={() => handleSelect(dir)}
                        />
                        <Action
                          title="View Git Diff"
                          icon={Icon.Code}
                          shortcut={{ modifiers: ["cmd"], key: "enter" }}
                          onAction={() => handleViewDiff(dir)}
                        />
                        <Action
                          title="Open in Finder"
                          icon={Icon.Finder}
                          shortcut={{ modifiers: ["cmd"], key: "o" }}
                          onAction={() => void handleOpenInFinder(dir)}
                        />
                        <Action
                          title="Open in Zed"
                          icon={Icon.Code}
                          shortcut={{ modifiers: ["cmd", "shift"], key: "o" }}
                          onAction={() => void handleOpenInZed(dir)}
                        />
                        <Action
                          title="Refresh Scan"
                          icon={Icon.ArrowClockwise}
                          shortcut={{ modifiers: ["cmd"], key: "r" }}
                          onAction={handleRefreshScan}
                        />
                        <Action
                          title="Remove from List"
                          icon={Icon.Trash}
                          style={Action.Style.Destructive}
                          shortcut={{ modifiers: ["cmd"], key: "d" }}
                          onAction={() => handleRemoveFromList(dir)}
                        />
                      </ActionPanel>
                    }
                  />
                );
              })}
            </List.Section>
          )}
          <List.Section title={hasSearch ? "Results" : "All Repositories"}>
            {filteredRepos.map((repo) => (
              <List.Item
                key={repo.fullPath}
                icon={Icon.Folder}
                title={repo.displayName}
                subtitle={getBranchSubtitle(statusByDir[repo.fullPath])}
                accessories={getWorkspaceStatusAccessories(
                  statusByDir[repo.fullPath],
                )}
                actions={
                  <ActionPanel>
                    <Action
                      title={primaryActionTitle}
                      onAction={() => handleSelect(repo.fullPath)}
                    />
                    <Action
                      title="View Git Diff"
                      icon={Icon.Code}
                      shortcut={{ modifiers: ["cmd"], key: "enter" }}
                      onAction={() => handleViewDiff(repo.fullPath)}
                    />
                    <Action
                      title="Open in Finder"
                      icon={Icon.Finder}
                      shortcut={{ modifiers: ["cmd"], key: "o" }}
                      onAction={() => void handleOpenInFinder(repo.fullPath)}
                    />
                    <Action
                      title="Open in Zed"
                      icon={Icon.Code}
                      shortcut={{ modifiers: ["cmd", "shift"], key: "o" }}
                      onAction={() => void handleOpenInZed(repo.fullPath)}
                    />
                    <Action
                      title="Refresh Scan"
                      icon={Icon.ArrowClockwise}
                      shortcut={{ modifiers: ["cmd"], key: "r" }}
                      onAction={handleRefreshScan}
                    />
                    <Action
                      title="Remove from List"
                      icon={Icon.Trash}
                      style={Action.Style.Destructive}
                      shortcut={{ modifiers: ["cmd"], key: "d" }}
                      onAction={() => handleRemoveFromList(repo.fullPath)}
                    />
                  </ActionPanel>
                }
              />
            ))}
          </List.Section>
        </>
      )}
    </List>
  );
}

const STATUS_ORDER: GitFileStatus[] = [
  "conflicted",
  "modified",
  "added",
  "deleted",
  "renamed",
  "copied",
  "untracked",
];

const STATUS_LABELS: Record<GitFileStatus, string> = {
  modified: "Modified",
  added: "Added",
  deleted: "Deleted",
  renamed: "Renamed",
  copied: "Copied",
  untracked: "Untracked",
  conflicted: "Conflicted",
};

const STATUS_MARKS: Record<GitFileStatus, string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  renamed: "R",
  copied: "C",
  untracked: "U",
  conflicted: "!",
};

const STATUS_COLORS: Record<GitFileStatus, Color> = {
  modified: Color.Yellow,
  added: Color.Green,
  deleted: Color.Red,
  renamed: Color.Purple,
  copied: Color.Magenta,
  untracked: Color.Blue,
  conflicted: Color.Red,
};

function RepoDiffPage({
  dirPath,
  primaryActionTitle,
  onContinue,
}: {
  dirPath: string;
  primaryActionTitle: string;
  onContinue: () => void | Promise<void>;
}) {
  const [files, setFiles] = useState<GitChangedFile[]>([]);
  const [diffByPath, setDiffByPath] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isDiffLoading, setIsDiffLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setIsDiffLoading(false);
    const changedFiles = await getGitChangedFiles(dirPath);
    setFiles(changedFiles);
    setDiffByPath({});
    setIsLoading(false);
    setIsDiffLoading(changedFiles.length > 0);

    void Promise.all(
      changedFiles.map(
        async (file) =>
          [file.path, await getGitFileDiff(dirPath, file)] as const,
      ),
    ).then((diffs) => {
      setDiffByPath(Object.fromEntries(diffs));
      setIsDiffLoading(false);
    });
  }, [dirPath]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleOpenZedGitPanel() {
    const started = openZedGitPanel(dirPath);
    if (!started) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to start Zed",
        message: dirPath,
      });
    }
  }

  const groupedFiles = STATUS_ORDER.map((status) => ({
    status,
    files: files.filter((file) => file.status === status),
  })).filter((group) => group.files.length > 0);

  function renderFile(file: GitChangedFile) {
    const diff = diffByPath[file.path];
    const stats = diff ? getDiffStats(diff) : null;

    return (
      <List.Item
        key={`${file.status}:${file.path}`}
        id={file.path}
        icon={{ source: Icon.Document, tintColor: STATUS_COLORS[file.status] }}
        title={file.path}
        subtitle={file.oldPath ? `from ${file.oldPath}` : undefined}
        accessories={[
          {
            text: {
              value: STATUS_MARKS[file.status],
              color: STATUS_COLORS[file.status],
            },
            tooltip: STATUS_LABELS[file.status],
          },
          ...(stats
            ? [
                {
                  text: { value: `+${stats.added}`, color: Color.Green },
                  tooltip: "Added lines",
                },
                {
                  text: { value: `-${stats.deleted}`, color: Color.Red },
                  tooltip: "Deleted lines",
                },
              ]
            : []),
        ]}
        detail={<List.Item.Detail markdown={formatDiffMarkdown(diff)} />}
        actions={
          <ActionPanel>
            <Action
              title={showDetails ? "Hide Diff" : "Show Diff"}
              icon={showDetails ? Icon.EyeDisabled : Icon.Eye}
              onAction={() => setShowDetails((current) => !current)}
            />
            <Action
              title={primaryActionTitle}
              shortcut={{ modifiers: ["cmd"], key: "enter" }}
              onAction={() => void onContinue()}
            />
            <Action
              title="Open Zed Git Panel"
              icon={Icon.Code}
              shortcut={{ modifiers: ["cmd"], key: "o" }}
              onAction={() => void handleOpenZedGitPanel()}
            />
            <Action
              title="Refresh"
              icon={Icon.ArrowClockwise}
              shortcut={{ modifiers: ["cmd"], key: "r" }}
              onAction={refresh}
            />
          </ActionPanel>
        }
      />
    );
  }

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={showDetails}
      navigationTitle="Git Diff"
      searchBarPlaceholder="Search changed files..."
    >
      {!isLoading && files.length === 0 ? (
        <List.EmptyView
          icon={Icon.CheckCircle}
          title="Clean Workspace"
          description={dirPath}
          actions={
            <ActionPanel>
              <Action
                title={primaryActionTitle}
                shortcut={{ modifiers: ["cmd"], key: "enter" }}
                onAction={() => void onContinue()}
              />
              <Action
                title="Open Zed Git Panel"
                icon={Icon.Code}
                shortcut={{ modifiers: ["cmd"], key: "o" }}
                onAction={() => void handleOpenZedGitPanel()}
              />
              <Action
                title="Refresh"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
                onAction={refresh}
              />
            </ActionPanel>
          }
        />
      ) : (
        <>
          {(isLoading || isDiffLoading) && (
            <List.Section>
              <List.Item
                icon={{ source: Icon.CircleProgress, tintColor: Color.Blue }}
                title={
                  isLoading
                    ? "Loading changed files..."
                    : "Loading file diffs..."
                }
              />
            </List.Section>
          )}
          {groupedFiles.map((group) => (
            <List.Section
              key={group.status}
              title={STATUS_LABELS[group.status]}
              subtitle={`${group.files.length}`}
            >
              {group.files.map(renderFile)}
            </List.Section>
          ))}
        </>
      )}
    </List>
  );
}

function formatDiffMarkdown(diff: string | undefined) {
  if (diff === undefined) return "Loading diff...";
  if (!diff.trim()) return "No textual diff available.";

  const maxLength = 80_000;
  const trimmed =
    diff.length > maxLength
      ? `${diff.slice(0, maxLength)}\n\n... diff truncated ...`
      : diff;

  return `\`\`\`diff\n${trimmed}\n\`\`\``;
}

function getDiffStats(diff: string) {
  let added = 0;
  let deleted = 0;

  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) added += 1;
    if (line.startsWith("-")) deleted += 1;
  }

  return { added, deleted };
}
