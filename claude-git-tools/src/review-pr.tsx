import {
  Action,
  ActionPanel,
  Alert,
  closeMainWindow,
  Color,
  confirmAlert,
  Icon,
  List,
  open,
  PopToRootType,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useState, useEffect, useCallback } from "react";
import { launchTask, readTaskOutput } from "./task-manager";
import {
  extractReviewReport,
  ReviewReportDetail,
  TaskDetail,
} from "./task-detail";
import { RepoPicker } from "./repo-picker";
import { getTasks, type Task } from "./storage";
import { SkillGate, type SkillConfig } from "./skill-picker";
import {
  execGhAsync,
  MERGE_METHOD_LABELS,
  type MergeMethod,
} from "./git-utils";

interface PullRequest {
  number: number;
  title: string;
  url: string;
  state: string;
  author: string;
  updatedAt: string;
  headRefName: string;
}

interface PRReviewState {
  hasReport: boolean;
  reportMarkdown?: string;
  isRunning: boolean;
  task?: Task;
}

async function fetchPRs(dir: string): Promise<PullRequest[]> {
  const ghArgs = (state: string) => [
    "pr",
    "list",
    "--state",
    state,
    "--json",
    "number,title,url,state,author,updatedAt,headRefName",
    "--limit",
    "50",
  ];
  const [openResult, closedResult] = await Promise.allSettled([
    execGhAsync(ghArgs("open"), dir),
    execGhAsync(ghArgs("closed"), dir),
  ]);

  const errors: string[] = [];
  const openJson =
    openResult.status === "fulfilled"
      ? openResult.value
      : (errors.push(String(openResult.reason)), "[]");
  const closedJson =
    closedResult.status === "fulfilled"
      ? closedResult.value
      : (errors.push(String(closedResult.reason)), "[]");

  if (errors.length > 0) {
    void showToast({
      style: Toast.Style.Failure,
      title: "Failed to fetch PRs",
      message: errors.join("; "),
    });
  }

  return [...parsePRs(openJson, "open"), ...parsePRs(closedJson, "closed")];
}

function parsePRs(json: string, fallbackState: string): PullRequest[] {
  try {
    const items = JSON.parse(json);
    return items.map(
      (item: {
        number: number;
        title: string;
        url: string;
        state: string;
        author: { login: string };
        updatedAt: string;
        headRefName: string;
      }) => ({
        number: item.number,
        title: item.title,
        url: item.url,
        state: (item.state || fallbackState).toLowerCase(),
        author: item.author?.login || "unknown",
        updatedAt: item.updatedAt,
        headRefName: item.headRefName || "",
      }),
    );
  } catch {
    return [];
  }
}

function PRPicker({
  dirPath,
  skill,
  onBack,
}: {
  dirPath: string;
  skill: SkillConfig;
  onBack: () => void;
}) {
  const { push } = useNavigation();
  const [searchText, setSearchText] = useState("");
  const [prs, setPrs] = useState<PullRequest[]>([]);
  const [reviewStates, setReviewStates] = useState<Map<string, PRReviewState>>(
    new Map(),
  );
  const [isLoading, setIsLoading] = useState(true);

  const loadReviewStates = useCallback(
    async (fetched: PullRequest[]) => {
      const tasks = await getTasks();
      const states = new Map<string, PRReviewState>();

      for (const pr of fetched) {
        const matchingTasks = tasks.filter(
          (t) =>
            t.command === "review-pr" &&
            t.prUrl === pr.url &&
            t.dir === dirPath,
        );

        const runningTask = matchingTasks.find((t) => t.status === "running");
        const completedTask = matchingTasks
          .filter((t) => t.status === "completed")
          .sort((a, b) => b.startTime - a.startTime)[0];

        if (runningTask) {
          states.set(pr.url, {
            hasReport: false,
            isRunning: true,
            task: runningTask,
          });
        } else if (completedTask) {
          const output = readTaskOutput(completedTask);
          const report = extractReviewReport(output);
          if (report) {
            states.set(pr.url, {
              hasReport: true,
              reportMarkdown: report,
              isRunning: false,
              task: completedTask,
            });
          }
        }
      }

      setReviewStates(states);
    },
    [dirPath],
  );

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const fetched = await fetchPRs(dirPath);
    setPrs(fetched);
    await loadReviewStates(fetched);
    setIsLoading(false);
  }, [dirPath, loadReviewStates]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const query = searchText.toLowerCase();
  const filtered = searchText
    ? prs.filter(
        (pr) =>
          pr.title.toLowerCase().includes(query) ||
          String(pr.number).includes(query) ||
          pr.author.toLowerCase().includes(query) ||
          pr.headRefName.toLowerCase().includes(query),
      )
    : prs;

  const openPRs = filtered.filter((pr) => pr.state === "open");
  const closedPRs = filtered
    .filter((pr) => pr.state !== "open")
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

  async function handleReview(pr: PullRequest) {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Reviewing PR #${pr.number}...`,
    });
    try {
      const task = await launchTask(
        "review-pr",
        dirPath,
        `review-pr #${pr.number}`,
        {
          prUrl: pr.url,
          skillName: skill.skillName,
          skillDir: skill.skillDir,
        },
      );
      toast.style = Toast.Style.Success;
      toast.title = "PR review task started";
      push(<TaskDetail task={task} onRerunReview={() => handleReview(pr)} />);
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to start PR review";
      toast.message = error instanceof Error ? error.message : String(error);
    }
  }

  async function handleCloseMainWindow() {
    await closeMainWindow({
      clearRootSearch: true,
      popToRootType: PopToRootType.Immediate,
    });
  }

  function handleOpenInBrowser(pr: PullRequest) {
    void open(pr.url);
    void handleCloseMainWindow();
  }

  async function handleMergePR(
    pr: PullRequest,
    method: MergeMethod,
  ) {
    const confirmed = await confirmAlert({
      title: `${MERGE_METHOD_LABELS[method]} PR #${pr.number}?`,
      message: pr.title,
      primaryAction: { title: MERGE_METHOD_LABELS[method], style: Alert.ActionStyle.Default },
      dismissAction: { title: "Cancel" },
    });
    if (!confirmed) return;
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Merging PR...",
    });
    try {
      await execGhAsync(
        ["pr", "merge", String(pr.number), method],
        dirPath,
      );
      toast.style = Toast.Style.Success;
      toast.title = `PR #${pr.number} merged`;
      await refresh();
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to merge PR";
      toast.message = error instanceof Error ? error.message : String(error);
    }
  }

  async function handleClosePR(pr: PullRequest) {
    const confirmed = await confirmAlert({
      title: `Close PR #${pr.number}?`,
      message: pr.title,
      primaryAction: { title: "Close", style: Alert.ActionStyle.Destructive },
      dismissAction: { title: "Cancel" },
    });
    if (!confirmed) return;
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Closing PR...",
    });
    try {
      await execGhAsync(["pr", "close", String(pr.number)], dirPath);
      toast.style = Toast.Style.Success;
      toast.title = `PR #${pr.number} closed`;
      await refresh();
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to close PR";
      toast.message = error instanceof Error ? error.message : String(error);
    }
  }

  function handleEnter(pr: PullRequest, reviewState?: PRReviewState) {
    if (reviewState?.hasReport && reviewState.reportMarkdown) {
      push(
        <ReviewReportDetail
          markdown={reviewState.reportMarkdown}
          gitUrl={pr.url}
          navigationTitle={`PR #${pr.number} Review`}
          prState={pr.state}
          dirPath={dirPath}
          onReview={() => handleReview(pr)}
        />,
      );
    } else if (reviewState?.isRunning && reviewState.task) {
      push(
        <TaskDetail
          task={reviewState.task}
          onRerunReview={() => handleReview(pr)}
        />,
      );
    } else if (pr.state === "open") {
      void handleReview(pr);
    } else {
      handleOpenInBrowser(pr);
    }
  }

  function renderPRItem(pr: PullRequest, isOpen: boolean) {
    const reviewState = reviewStates.get(pr.url);
    const accessories: List.Item.Accessory[] = [];

    if (reviewState?.hasReport) {
      accessories.push({
        tag: { value: "Reviewed", color: Color.Green },
        icon: Icon.Document,
      });
    } else if (reviewState?.isRunning) {
      accessories.push({
        tag: { value: "Reviewing...", color: Color.Orange },
        icon: Icon.CircleProgress,
      });
    }

    accessories.push(
      { text: pr.author },
      { text: new Date(pr.updatedAt).toLocaleDateString() },
    );

    const actions = (
      <ActionPanel>
        <Action
          title={
            reviewState?.hasReport
              ? "View Review Report"
              : reviewState?.isRunning
                ? "View Review Task"
                : isOpen
                  ? "Review PR"
                  : "Open in Browser"
          }
          icon={
            reviewState?.hasReport
              ? Icon.Document
              : reviewState?.isRunning
                ? Icon.CircleProgress
                : isOpen
                  ? Icon.MagnifyingGlass
                  : Icon.Globe
          }
          onAction={() => handleEnter(pr, reviewState)}
        />
        <Action.CopyToClipboard
          title="Copy PR Link"
          content={pr.url}
          shortcut={{ modifiers: ["cmd"], key: "enter" }}
        />
        <Action
          title="Open in Browser"
          icon={Icon.Globe}
          shortcut={{ modifiers: ["cmd"], key: "o" }}
          onAction={() => handleOpenInBrowser(pr)}
        />
        {isOpen && !reviewState?.isRunning && (
          <Action
            title="Start New Review"
            icon={Icon.MagnifyingGlass}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
            onAction={() => handleReview(pr)}
          />
        )}
        {isOpen && (
          <>
            <ActionPanel.Submenu
              title="Approve & Merge"
              icon={Icon.Check}
              shortcut={{ modifiers: ["cmd"], key: "y" }}
            >
              <Action
                title="Merge"
                icon={Icon.Check}
                onAction={() => handleMergePR(pr, "--merge")}
              />
              <Action
                title="Rebase and Merge"
                icon={Icon.ArrowRight}
                onAction={() => handleMergePR(pr, "--rebase")}
              />
              <Action
                title="Squash and Merge"
                icon={Icon.Layers}
                onAction={() => handleMergePR(pr, "--squash")}
              />
            </ActionPanel.Submenu>
            <Action
              title="Close PR"
              icon={Icon.XMarkCircle}
              style={Action.Style.Destructive}
              shortcut={{ modifiers: ["cmd"], key: "n" }}
              onAction={() => handleClosePR(pr)}
            />
          </>
        )}
        <Action
          title="Refresh"
          icon={Icon.ArrowClockwise}
          shortcut={{ modifiers: ["cmd"], key: "r" }}
          onAction={refresh}
        />
        <Action
          title="Back"
          icon={Icon.ArrowLeft}
          shortcut={{ modifiers: ["cmd"], key: "[" }}
          onAction={onBack}
        />
      </ActionPanel>
    );

    return (
      <List.Item
        key={pr.number}
        icon={isOpen ? Icon.CircleProgress : Icon.CheckCircle}
        title={`#${pr.number} ${pr.title}`}
        subtitle={pr.headRefName}
        accessories={accessories}
        actions={actions}
      />
    );
  }

  return (
    <List
      isLoading={isLoading}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search pull requests..."
      navigationTitle="Select Pull Request"
    >
      {openPRs.length > 0 && (
        <List.Section title="Open">
          {openPRs.map((pr) => renderPRItem(pr, true))}
        </List.Section>
      )}
      {closedPRs.length > 0 && (
        <List.Section title="Closed / Merged">
          {closedPRs.map((pr) => renderPRItem(pr, false))}
        </List.Section>
      )}
      {!isLoading && filtered.length === 0 && (
        <List.EmptyView
          title="No Pull Requests"
          description="Press ⌘R to refresh"
          actions={
            <ActionPanel>
              <Action
                title="Refresh"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
                onAction={refresh}
              />
              <Action
                title="Back"
                icon={Icon.ArrowLeft}
                shortcut={{ modifiers: ["cmd"], key: "[" }}
                onAction={onBack}
              />
            </ActionPanel>
          }
        />
      )}
    </List>
  );
}

export default function ReviewPR() {
  return (
    <SkillGate command="review-pr">
      {(skill) => <ReviewPRInner skill={skill} />}
    </SkillGate>
  );
}

function ReviewPRInner({ skill }: { skill: SkillConfig }) {
  const [selectedDir, setSelectedDir] = useState<string | null>(null);

  if (selectedDir) {
    return (
      <PRPicker
        dirPath={selectedDir}
        skill={skill}
        onBack={() => setSelectedDir(null)}
      />
    );
  }

  return (
    <RepoPicker
      primaryActionTitle="Select"
      onSelect={(fullPath) => setSelectedDir(fullPath)}
    />
  );
}
