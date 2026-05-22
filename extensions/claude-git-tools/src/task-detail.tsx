import {
  Action,
  ActionPanel,
  Alert,
  closeMainWindow,
  Clipboard,
  confirmAlert,
  Detail,
  Icon,
  List,
  open,
  PopToRootType,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useCallback, useEffect, useState } from "react";
import { getTasks, removeTask, updateTask, type Task } from "./storage";
import {
  getTaskStatus,
  getSkillOptionsForCommand,
  launchTask,
  readTaskOutput,
  readTaskOutputPreview,
  stopTask,
} from "./task-manager";
import {
  execGhAsync,
  extractPrNumber,
  getGitRemoteBaseUrl,
  MERGE_METHOD_LABELS,
  replaceGitUrlBase,
  type MergeMethod,
} from "./git-utils";

type ReviewShortcutState =
  | "querying"
  | "closed"
  | "merged"
  | "reviewed"
  | "ready for review";

async function getReviewShortcutState(
  prUrl: string,
  dir: string,
): Promise<ReviewShortcutState> {
  try {
    const stdout = await execGhAsync(
      ["pr", "view", prUrl, "--json", "state"],
      dir,
    );
    const data = JSON.parse(stdout);
    const state = String(data.state || "").toLowerCase();
    if (state === "merged") return "merged";
    if (state === "open") return "ready for review";
    return "closed";
  } catch {
    return "closed";
  }
}

async function checkPrOpen(prUrl: string, dir: string): Promise<boolean> {
  return (await getReviewShortcutState(prUrl, dir)) === "ready for review";
}

const REFRESH_INTERVAL_MS = 1000;
const LATEST_OUTPUT_LINE_LIMIT = 11;
const EMPTY_OUTPUT_TEXT = "(waiting for output...)";
const REVIEW_REPORT_DELIMITER = "!--------!";
const CREATE_PR_FINAL_RESPONSE_START = "CREATE_PR_FINAL_RESPONSE_BEGIN";
const CREATE_PR_FINAL_RESPONSE_END = "CREATE_PR_FINAL_RESPONSE_END";

export interface ReviewReportEntry {
  id: string;
  markdown: string;
  createdAt: number;
}

function extractLastMatch(text: string, pattern: RegExp): string | null {
  const matches = [...text.matchAll(pattern)];
  return matches.length > 0 ? matches[matches.length - 1][0] : null;
}

function normalizeExtractedUrl(url: string): string {
  return url.replace(/[.,;:)']*$/, "");
}

function extractMarkdownLinkTargets(text: string, pattern: RegExp): string[] {
  const markdownLinkPattern = /\[[^\]]*?\]\((https:\/\/[^)\s]+)\)/gs;
  return [...text.matchAll(markdownLinkPattern)]
    .map((match) => normalizeExtractedUrl(match[1] || ""))
    .filter((url) => pattern.test(url));
}

function extractFirstMarkdownLinkTarget(
  text: string,
  pattern: RegExp,
): string | null {
  return extractMarkdownLinkTargets(text, pattern)[0] || null;
}

function extractLastMarkdownLinkTarget(
  text: string,
  pattern: RegExp,
): string | null {
  const matches = extractMarkdownLinkTargets(text, pattern);
  return matches.length > 0 ? matches[matches.length - 1] : null;
}

function extractCreatePrFinalUrl(output: string): string | null {
  const blockPattern = new RegExp(
    `${CREATE_PR_FINAL_RESPONSE_START}([\\s\\S]*?)${CREATE_PR_FINAL_RESPONSE_END}`,
    "g",
  );
  const blocks = [...output.matchAll(blockPattern)];
  for (const block of blocks.reverse()) {
    const content = block[1] || "";
    const url =
      extractLastMarkdownLinkTarget(
        content,
        /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/[0-9]+$/,
      ) ||
      extractLastMarkdownLinkTarget(
        content,
        /^https:\/\/gitlab\.com\/[^\s<>")']+\/-\/merge_requests\/[0-9]+$/,
      ) ||
      extractLastMarkdownLinkTarget(
        content,
        /^https:\/\/bitbucket\.org\/[^\s<>")']+\/pull-requests\/[0-9]+$/,
      ) ||
      extractLastMatch(
        content,
        /https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/[0-9]+/g,
      ) ||
      extractLastMatch(
        content,
        /https:\/\/gitlab\.com\/[^\s<>")']+\/-\/merge_requests\/[0-9]+/g,
      ) ||
      extractLastMatch(
        content,
        /https:\/\/bitbucket\.org\/[^\s<>")']+\/pull-requests\/[0-9]+/g,
      );
    if (url) return url;
  }
  return null;
}

export function extractReviewReport(output: string): string | null {
  return extractReviewReports(output)[0]?.markdown ?? null;
}

export function extractReviewReports(
  output: string,
  baseCreatedAt = 0,
): ReviewReportEntry[] {
  const reports: ReviewReportEntry[] = [];
  let searchStart = 0;

  while (searchStart < output.length) {
    const startIdx = output.indexOf(REVIEW_REPORT_DELIMITER, searchStart);
    if (startIdx === -1) break;

    const contentStart = startIdx + REVIEW_REPORT_DELIMITER.length;
    const endIdx = output.indexOf(REVIEW_REPORT_DELIMITER, contentStart);
    if (endIdx === -1) break;

    const markdown = output.slice(contentStart, endIdx).trim();
    if (markdown) {
      reports.push({
        id: `${baseCreatedAt}:${startIdx}:${endIdx}`,
        markdown,
        createdAt: baseCreatedAt + reports.length,
      });
    }

    searchStart = endIdx + REVIEW_REPORT_DELIMITER.length;
  }

  return reports.sort((a, b) => b.createdAt - a.createdAt);
}

export function fallbackReviewReport(task: Task): string | null {
  if (task.command !== "review-pr" || !task.prUrl) return null;
  return [
    "# PR 审查报告",
    "",
    "## 总结",
    "",
    "任务已完成，但 agent 没有返回可解析的 `!--------!` 报告块。",
    "请以 PR 页面中的最新审查评论为准。",
    "",
    "**结论**: 已审查",
    "",
    `PR: ${task.prUrl}`,
  ].join("\n");
}

function getReviewReportEntriesFromTask(task: Task): ReviewReportEntry[] {
  const reports = extractReviewReports(readTaskOutput(task), task.startTime);
  if (reports.length > 0) return reports;

  const fallback = fallbackReviewReport(task);
  return fallback
    ? [
        {
          id: `${task.id}:fallback`,
          markdown: fallback,
          createdAt: task.startTime,
        },
      ]
    : [];
}

async function findLocalReviewReports(
  prUrl: string,
): Promise<ReviewReportEntry[]> {
  const tasks = await getTasks();
  const completedReviewTasks = tasks
    .filter(
      (item) =>
        item.command === "review-pr" &&
        item.prUrl === prUrl &&
        item.status === "completed",
    )
    .sort((a, b) => b.startTime - a.startTime);

  return completedReviewTasks
    .flatMap(getReviewReportEntriesFromTask)
    .sort((a, b) => b.createdAt - a.createdAt);
}

function mergeReviewReportEntries(
  ...groups: ReviewReportEntry[][]
): ReviewReportEntry[] {
  const byId = new Map<string, ReviewReportEntry>();

  for (const report of groups.flat()) {
    byId.set(report.id, report);
  }

  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
}

function getStatusLabel(status: Task["status"]): string {
  switch (status) {
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "stopped":
    case "canceled":
      return "Canceled";
  }
}

function escapeCodeFence(text: string): string {
  return text.replace(/```/g, "'''");
}

function getLatestOutputText(output: string): string {
  const lines = output
    .trimEnd()
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return EMPTY_OUTPUT_TEXT;
  }

  return lines.slice(-LATEST_OUTPUT_LINE_LIMIT).join("\n");
}

function formatDiffBlock(text: string): string {
  return `\`\`\`diff\n${escapeCodeFence(text)}\n\`\`\``;
}

export function extractGitUrl(task: Task, output: string): string | null {
  let url: string | null = null;

  if (task.command === "review-pr" && task.prUrl) {
    url = task.prUrl;
  }

  if (task.command === "create-pr") {
    url =
      extractCreatePrFinalUrl(output) ||
      extractLastMarkdownLinkTarget(
        output,
        /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/[0-9]+$/,
      ) ||
      extractLastMarkdownLinkTarget(
        output,
        /^https:\/\/gitlab\.com\/[^\s<>")']+\/-\/merge_requests\/[0-9]+$/,
      ) ||
      extractLastMarkdownLinkTarget(
        output,
        /^https:\/\/bitbucket\.org\/[^\s<>")']+\/pull-requests\/[0-9]+$/,
      ) ||
      extractLastMatch(
        output,
        /https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/[0-9]+/g,
      ) ||
      extractLastMatch(
        output,
        /https:\/\/gitlab\.com\/[^\s<>")']+\/-\/merge_requests\/[0-9]+/g,
      ) ||
      extractLastMatch(
        output,
        /https:\/\/bitbucket\.org\/[^\s<>")']+\/pull-requests\/[0-9]+/g,
      );
  }

  if (task.command === "review-pr") {
    url =
      extractFirstMarkdownLinkTarget(
        output,
        /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/[0-9]+$/,
      ) || url;

    if (!url) {
      const githubMatch = output.match(
        /https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/[0-9]+/,
      );
      if (githubMatch) {
        url = githubMatch[0];
      }
    }

    if (!url) {
      url =
        extractFirstMarkdownLinkTarget(
          output,
          /^https:\/\/gitlab\.com\/[^\s<>")']+\/-\/merge_requests\/[0-9]+$/,
        ) || null;
      if (!url) {
        const gitlabMatch = output.match(
          /https:\/\/gitlab\.com\/[^\s<>")']+\/-\/merge_requests\/[0-9]+/,
        );
        if (gitlabMatch) url = gitlabMatch[0];
      }
    }

    if (!url) {
      url =
        extractFirstMarkdownLinkTarget(
          output,
          /^https:\/\/bitbucket\.org\/[^\s<>")']+\/pull-requests\/[0-9]+$/,
        ) || null;
      if (!url) {
        const bitbucketMatch = output.match(
          /https:\/\/bitbucket\.org\/[^\s<>")']+\/pull-requests\/[0-9]+/,
        );
        if (bitbucketMatch) url = bitbucketMatch[0];
      }
    }
  }
  if (task.command === "git-push") {
    url = extractFirstMarkdownLinkTarget(
      output,
      /^https:\/\/(github\.com|gitlab\.com)\/[^\s<>")']+\/commit\/[0-9a-f]+$/,
    );

    if (!url) {
      const commitMatch = output.match(
        /https:\/\/(github\.com|gitlab\.com)\/[^\s<>")']+\/commit\/[0-9a-f]+/,
      );
      if (commitMatch) {
        url = commitMatch[0];
      }
    }

    if (!url) {
      url = extractFirstMarkdownLinkTarget(
        output,
        /^https:\/\/bitbucket\.org\/[^\s<>")']+\/commits\/[0-9a-f]+$/,
      );
      if (!url) {
        const bitbucketCommitMatch = output.match(
          /https:\/\/bitbucket\.org\/[^\s<>")']+\/commits\/[0-9a-f]+/,
        );
        if (bitbucketCommitMatch) url = bitbucketCommitMatch[0];
      }
    }

    if (!url) {
      url = extractLastMarkdownLinkTarget(
        output,
        /^https:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/[^\s<>")']+$/,
      );
      if (!url) {
        const gitHostMatch = output.match(
          /https:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/[^\s<>")']+/g,
        );
        if (gitHostMatch) {
          url = normalizeExtractedUrl(gitHostMatch[gitHostMatch.length - 1]);
        }
      }
    }

    if (!url) {
      const sshMatch = output.match(
        /To\s+(?:git@)?(github\.com|gitlab\.com|bitbucket\.org):([^\s]+)/,
      );
      if (sshMatch) {
        const host = sshMatch[1];
        const path = sshMatch[2].replace(/\.git$/, "");
        url = `https://${host}/${path}`;
      }
    }
  }

  if (url) {
    const remoteBase = getGitRemoteBaseUrl(task.dir);
    if (remoteBase) {
      return replaceGitUrlBase(url, remoteBase);
    }
  }
  return url;
}

function formatStatusLine(status: Task["status"]): string {
  const prefix = status === "running" ? "+" : "-";
  return `${prefix} status: ${getStatusLabel(status)}`;
}

function formatMetadataLine(task: Task): string {
  const elapsed = Math.round((Date.now() - task.startTime) / 1000);
  const parts = [
    `agent: ${task.agent || "claude"}`,
    `branch: ${task.branch || "unknown"}`,
  ];

  if (task.targetBranch) {
    parts.push(`target: ${task.targetBranch}`);
  }

  parts.push(`dir: ${task.dir}`, `elapsed: ${elapsed}s`);

  return parts.join(" | ");
}

function sanitizeCommandLine(commandLine: string): string {
  const sanitizePrompt = (match: string, prefix: string, prompt: string) =>
    prompt.startsWith("[prompt omitted; see ")
      ? match
      : `${prefix}'[prompt omitted]'`;

  return commandLine
    .replace(/(--prompt\s+)'((?:'\\''|[^'])*)'/, sanitizePrompt)
    .replace(
      /(\bopencode\s+run\b[\s\S]*\s--\s)'((?:'\\''|[^'])*)'$/,
      sanitizePrompt,
    );
}

function formatCommandLine(task: Task): string {
  return `command: ${
    task.commandLine ? sanitizeCommandLine(task.commandLine) : "(unavailable)"
  }`;
}

function formatTerminalMarkdown(
  task: Task,
  status: Task["status"],
  output: string,
): string {
  const lines = [
    task.label,
    formatStatusLine(status),
    formatMetadataLine(task),
    formatCommandLine(task),
    getLatestOutputText(output),
  ];

  return formatDiffBlock(lines.join("\n"));
}

function formatTaskDetailTitle(
  task: Task,
  showReviewShortcutHint: boolean,
  reviewShortcutState: ReviewShortcutState,
): string {
  if (!showReviewShortcutHint || reviewShortcutState === "querying") {
    return task.label;
  }

  switch (reviewShortcutState) {
    case "ready for review":
      return `${task.label} · Ready (cmd+shift+r to review)`;
    case "reviewed":
      return `${task.label} · Reviewed`;
    case "merged":
      return `${task.label} · Merged`;
    case "closed":
      return `${task.label} · Closed`;
    case "querying":
      return task.label;
  }
}

export function TaskDetail({
  task,
  allowClear = false,
  onRerunReview,
}: {
  task: Task;
  allowClear?: boolean;
  onRerunReview?: () => void;
}) {
  const { pop, push } = useNavigation();
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState<Task["status"]>(task.status);
  const [hasAutoNavigated, setHasAutoNavigated] = useState(false);
  const [prOpen, setPrOpen] = useState(false);
  const [reviewShortcutState, setReviewShortcutState] =
    useState<ReviewShortcutState>("querying");
  const [createPrReviewReports, setCreatePrReviewReports] = useState<
    ReviewReportEntry[]
  >([]);
  const [reviewReportEntries, setReviewReportEntries] = useState<
    ReviewReportEntry[]
  >([]);

  const isReviewPr = task.command === "review-pr" && !!task.prUrl;

  const checkReviewPrState = useCallback(async () => {
    if (!isReviewPr || !task.prUrl) return;
    const open = await checkPrOpen(task.prUrl, task.dir);
    setPrOpen(open);
  }, [isReviewPr, task.prUrl, task.dir]);

  const refresh = useCallback(async () => {
    const taskWithCurrentStatus = { ...task, status };
    const nextOutput = readTaskOutputPreview(task);
    const nextStatus = getTaskStatus(taskWithCurrentStatus);

    setOutput(nextOutput);

    let parsedReviewReports: ReviewReportEntry[] = [];
    if (
      isReviewPr &&
      nextStatus === "completed" &&
      reviewReportEntries.length === 0
    ) {
      parsedReviewReports = task.prUrl
        ? mergeReviewReportEntries(
            await findLocalReviewReports(task.prUrl),
            getReviewReportEntriesFromTask(task),
          )
        : getReviewReportEntriesFromTask(task);
      setReviewReportEntries(parsedReviewReports);
    }

    if (nextStatus !== status) {
      const wasRunning = status === "running";
      setStatus(nextStatus);
      await updateTask(task.id, { status: nextStatus });

      if (
        !hasAutoNavigated &&
        task.command === "review-pr" &&
        nextStatus === "completed" &&
        task.prUrl
      ) {
        if (parsedReviewReports.length > 0) {
          setHasAutoNavigated(true);
          const prState = await checkPrOpen(task.prUrl, task.dir).then((o) =>
            o ? "open" : "closed",
          );
          push(
            <ReviewReportDetail
              markdown={parsedReviewReports[0].markdown}
              reports={parsedReviewReports}
              initialReportId={getReviewReportEntriesFromTask(task)[0]?.id}
              gitUrl={task.prUrl}
              navigationTitle={task.label}
              prState={prState}
              dirPath={task.dir}
              onReview={onRerunReview}
            />,
          );
          return;
        }
      }

      if (wasRunning && nextStatus === "completed" && isReviewPr) {
        await checkReviewPrState();
      }
    }
  }, [
    status,
    task,
    hasAutoNavigated,
    push,
    isReviewPr,
    reviewReportEntries.length,
    checkReviewPrState,
    onRerunReview,
  ]);

  useEffect(() => {
    void refresh();
    if (status !== "running") return;
    const timer = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!isReviewPr) return;
    void checkReviewPrState();
  }, [isReviewPr, checkReviewPrState]);

  const running = status === "running";
  const finished = status === "completed";
  const displayOutput = output;
  const gitUrl = finished ? extractGitUrl(task, displayOutput) : null;

  useEffect(() => {
    if (task.command !== "create-pr" || !gitUrl) {
      return;
    }
    let canceled = false;
    setReviewShortcutState("querying");
    setCreatePrReviewReports([]);
    setPrOpen(false);
    void Promise.all([
      findLocalReviewReports(gitUrl),
      getReviewShortcutState(gitUrl, task.dir),
    ]).then(([localReports, nextState]) => {
      if (canceled) return;
      setCreatePrReviewReports(localReports);
      setPrOpen(nextState === "ready for review");
      setReviewShortcutState(localReports.length > 0 ? "reviewed" : nextState);
    });
    return () => {
      canceled = true;
    };
  }, [task.command, task.dir, gitUrl]);

  const prNumber = extractPrNumber(task.prUrl || gitUrl || "");

  async function handleMergePR(method: MergeMethod) {
    if (!prNumber) return;
    const confirmed = await confirmAlert({
      title: `${MERGE_METHOD_LABELS[method]} PR #${prNumber}?`,
      message: task.label,
      primaryAction: {
        title: MERGE_METHOD_LABELS[method],
        style: Alert.ActionStyle.Default,
      },
      dismissAction: { title: "Cancel" },
    });
    if (!confirmed) return;
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Merging PR...",
    });
    try {
      await execGhAsync(["pr", "merge", prNumber, method], task.dir);
      toast.style = Toast.Style.Success;
      toast.title = `PR #${prNumber} merged`;
      setPrOpen(false);
      setReviewShortcutState("merged");
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to merge PR";
      toast.message = error instanceof Error ? error.message : String(error);
    }
  }

  async function handleClosePR() {
    if (!prNumber) return;
    const confirmed = await confirmAlert({
      title: `Close PR #${prNumber}?`,
      message: task.label,
      primaryAction: { title: "Close", style: Alert.ActionStyle.Destructive },
      dismissAction: { title: "Cancel" },
    });
    if (!confirmed) return;
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Closing PR...",
    });
    try {
      await execGhAsync(["pr", "close", prNumber], task.dir);
      toast.style = Toast.Style.Success;
      toast.title = `PR #${prNumber} closed`;
      setPrOpen(false);
      setReviewShortcutState("closed");
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to close PR";
      toast.message = error instanceof Error ? error.message : String(error);
    }
  }

  async function handleStop() {
    await showToast({ style: Toast.Style.Animated, title: "Stopping task..." });
    await stopTask({ ...task, status });
    setStatus("stopped");
    setOutput(readTaskOutputPreview(task));
    await showToast({ style: Toast.Style.Success, title: "Task canceled" });
  }

  async function handleClear() {
    await removeTask(task.id);
    pop();
  }

  async function handleCloseMainWindow() {
    await closeMainWindow({
      clearRootSearch: true,
      popToRootType: PopToRootType.Immediate,
    });
  }

  async function handleCopyFullOutput() {
    await Clipboard.copy(readTaskOutput(task));
    await showToast({ style: Toast.Style.Success, title: "Output copied" });
  }

  async function handleOpenLogFile() {
    await open(task.outputFile);
  }

  async function handleStartReview() {
    if (!gitUrl) return;
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Starting PR review...",
    });
    try {
      const skillOpts = await getSkillOptionsForCommand("review-pr");
      const reviewTask = await launchTask("review-pr", task.dir, "review-pr", {
        prUrl: gitUrl,
        ...skillOpts,
      });
      if (!reviewTask) {
        toast.style = Toast.Style.Failure;
        toast.title = "No skill file configured";
        toast.message = "Please configure one via Manage Folders&Skills&Agents";
        return;
      }
      toast.style = Toast.Style.Success;
      toast.title = "PR review task started";
      push(
        <TaskDetail
          task={reviewTask}
          onRerunReview={async () => {
            const so = await getSkillOptionsForCommand("review-pr");
            const t = await launchTask("review-pr", task.dir, "review-pr", {
              prUrl: gitUrl,
              ...so,
            });
            if (t) push(<TaskDetail task={t} />);
          }}
        />,
      );
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to start PR review";
      toast.message = error instanceof Error ? error.message : String(error);
    }
  }

  const reviewReport =
    finished && task.command === "review-pr" && task.prUrl
      ? reviewReportEntries[0]?.markdown
      : null;
  const showReviewShortcutHint =
    finished && task.command === "create-pr" && !!gitUrl;
  const hasReviewReportAction =
    (reviewReport && task.prUrl) ||
    (createPrReviewReports.length > 0 && gitUrl);
  const markdown = formatTerminalMarkdown(task, status, displayOutput);
  const navigationTitle = formatTaskDetailTitle(
    task,
    showReviewShortcutHint,
    reviewShortcutState,
  );

  return (
    <Detail
      isLoading={showReviewShortcutHint && reviewShortcutState === "querying"}
      markdown={markdown}
      navigationTitle={navigationTitle}
      actions={
        <ActionPanel>
          {reviewReport && task.prUrl && (
            <Action
              title="View Review Report"
              icon={Icon.Document}
              onAction={() =>
                push(
                  <ReviewReportDetail
                    markdown={reviewReport}
                    reports={reviewReportEntries}
                    initialReportId={
                      getReviewReportEntriesFromTask(task)[0]?.id
                    }
                    gitUrl={task.prUrl!}
                    navigationTitle={task.label}
                    prState={prOpen ? "open" : "closed"}
                    dirPath={task.dir}
                    onReview={onRerunReview}
                  />,
                )
              }
            />
          )}
          {createPrReviewReports.length > 0 && gitUrl && (
            <Action
              title="View Review Report"
              icon={Icon.Document}
              onAction={() =>
                push(
                  <ReviewReportDetail
                    markdown={createPrReviewReports[0].markdown}
                    reports={createPrReviewReports}
                    gitUrl={gitUrl}
                    navigationTitle={task.label}
                    prState={prOpen ? "open" : "closed"}
                    dirPath={task.dir}
                    onReview={
                      prOpen ? () => void handleStartReview() : undefined
                    }
                  />,
                )
              }
            />
          )}
          {!hasReviewReportAction && (
            <Action
              title="Close Raycast"
              icon={Icon.Window}
              onAction={() => void handleCloseMainWindow()}
            />
          )}
          {finished && prOpen && prNumber && (
            <>
              <ActionPanel.Submenu
                title="Approve & Merge"
                icon={Icon.Check}
                shortcut={{ modifiers: ["cmd"], key: "y" }}
              >
                <Action
                  title="Merge"
                  icon={Icon.Check}
                  onAction={() => void handleMergePR("--merge")}
                />
                <Action
                  title="Rebase and Merge"
                  icon={Icon.ArrowRight}
                  onAction={() => void handleMergePR("--rebase")}
                />
                <Action
                  title="Squash and Merge"
                  icon={Icon.Layers}
                  onAction={() => void handleMergePR("--squash")}
                />
              </ActionPanel.Submenu>
              <Action
                title="Close Pr"
                icon={Icon.XMarkCircle}
                style={Action.Style.Destructive}
                shortcut={{ modifiers: ["cmd"], key: "n" }}
                onAction={() => void handleClosePR()}
              />
            </>
          )}
          {gitUrl && (
            <>
              <Action.CopyToClipboard title="Copy Git Link" content={gitUrl} />
              <Action
                title="Open Git Link"
                icon={Icon.Link}
                shortcut={{ modifiers: ["cmd"], key: "o" }}
                onAction={() => {
                  void open(gitUrl);
                  void handleCloseMainWindow();
                }}
              />
            </>
          )}
          {reviewReport && task.prUrl && (
            <Action
              title="Close Raycast"
              icon={Icon.Window}
              onAction={() => void handleCloseMainWindow()}
            />
          )}
          {task.command === "create-pr" &&
            reviewShortcutState === "ready for review" &&
            prOpen &&
            gitUrl && (
              <Action
                title="Review Pr"
                icon={Icon.MagnifyingGlass}
                shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
                onAction={() => void handleStartReview()}
              />
            )}
          <Action
            title="Copy Output"
            icon={Icon.Clipboard}
            shortcut={{ modifiers: ["cmd", "shift"], key: "enter" }}
            onAction={() => void handleCopyFullOutput()}
          />
          <Action
            title="Open Log File"
            icon={Icon.Document}
            shortcut={{ modifiers: ["cmd", "shift"], key: "o" }}
            onAction={() => void handleOpenLogFile()}
          />
          <Action
            title="Refresh"
            icon={Icon.ArrowClockwise}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
            onAction={() => void refresh()}
          />
          {running && (
            <Action
              title="Stop Task"
              icon={Icon.Stop}
              style={Action.Style.Destructive}
              shortcut={{ modifiers: ["cmd"], key: "." }}
              onAction={() => void handleStop()}
            />
          )}
          {allowClear && !running && (
            <Action
              title="Clear Task & Back"
              icon={Icon.Trash}
              style={Action.Style.Destructive}
              onAction={() => void handleClear()}
            />
          )}
          <Action
            title="Back"
            icon={Icon.ArrowLeft}
            shortcut={{ modifiers: ["cmd"], key: "[" }}
            onAction={pop}
          />
        </ActionPanel>
      }
    />
  );
}

export function ReviewReportDetail({
  markdown,
  reports,
  initialReportId,
  gitUrl,
  navigationTitle,
  prState,
  dirPath,
  onReview,
}: {
  markdown: string;
  reports?: ReviewReportEntry[];
  initialReportId?: string;
  gitUrl: string;
  navigationTitle: string;
  prState?: string;
  dirPath?: string;
  onReview?: () => void;
}) {
  const { pop } = useNavigation();
  const initialReportEntries =
    reports && reports.length > 0
      ? reports
      : [{ id: "report", markdown, createdAt: 0 }];
  const [reportEntries, setReportEntries] = useState(initialReportEntries);
  const [selectedReportId, setSelectedReportId] = useState(
    initialReportId &&
      reportEntries.some((report) => report.id === initialReportId)
      ? initialReportId
      : reportEntries[0].id,
  );
  const selectedReport =
    reportEntries.find((report) => report.id === selectedReportId) ??
    reportEntries[0];

  useEffect(() => {
    if (!reportEntries.some((report) => report.id === selectedReportId)) {
      setSelectedReportId(reportEntries[0].id);
    }
  }, [reportEntries, selectedReportId]);

  useEffect(() => {
    let canceled = false;
    void findLocalReviewReports(gitUrl).then((samePrReports) => {
      if (canceled || samePrReports.length === 0) return;
      setReportEntries((current) =>
        mergeReviewReportEntries(samePrReports, current),
      );
    });
    return () => {
      canceled = true;
    };
  }, [gitUrl]);

  async function handleCloseMainWindow() {
    await closeMainWindow({
      clearRootSearch: true,
      popToRootType: PopToRootType.Immediate,
    });
  }

  const canReview = prState === "open" && dirPath && onReview;
  const isOpen = prState === "open" && dirPath;
  const prNumber = extractPrNumber(gitUrl);

  async function handleMergePR(method: MergeMethod) {
    if (!prNumber || !dirPath) return;
    const confirmed = await confirmAlert({
      title: `${MERGE_METHOD_LABELS[method]} PR #${prNumber}?`,
      message: navigationTitle,
      primaryAction: {
        title: MERGE_METHOD_LABELS[method],
        style: Alert.ActionStyle.Default,
      },
      dismissAction: { title: "Cancel" },
    });
    if (!confirmed) return;
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Merging PR...",
    });
    try {
      await execGhAsync(["pr", "merge", prNumber, method], dirPath);
      toast.style = Toast.Style.Success;
      toast.title = `PR #${prNumber} merged`;
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to merge PR";
      toast.message = error instanceof Error ? error.message : String(error);
    }
  }

  async function handleClosePR() {
    if (!prNumber || !dirPath) return;
    const confirmed = await confirmAlert({
      title: `Close PR #${prNumber}?`,
      message: navigationTitle,
      primaryAction: { title: "Close", style: Alert.ActionStyle.Destructive },
      dismissAction: { title: "Cancel" },
    });
    if (!confirmed) return;
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Closing PR...",
    });
    try {
      await execGhAsync(["pr", "close", prNumber], dirPath);
      toast.style = Toast.Style.Success;
      toast.title = `PR #${prNumber} closed`;
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to close PR";
      toast.message = error instanceof Error ? error.message : String(error);
    }
  }

  const reportActions = (
    <ActionPanel>
      <Action
        title="Close Raycast"
        icon={Icon.Window}
        onAction={() => void handleCloseMainWindow()}
      />
      <Action.CopyToClipboard title="Copy Pr Link" content={gitUrl} />
      <Action
        title="Open in Browser"
        icon={Icon.Globe}
        shortcut={{ modifiers: ["cmd"], key: "o" }}
        onAction={() => {
          void open(gitUrl);
          void handleCloseMainWindow();
        }}
      />
      {canReview && (
        <Action
          title="Re-run Review"
          icon={Icon.ArrowClockwise}
          shortcut={{ modifiers: ["cmd"], key: "r" }}
          onAction={onReview}
        />
      )}
      {isOpen && prNumber && (
        <>
          <ActionPanel.Submenu
            title="Approve & Merge"
            icon={Icon.Check}
            shortcut={{ modifiers: ["cmd"], key: "y" }}
          >
            <Action
              title="Merge"
              icon={Icon.Check}
              onAction={() => void handleMergePR("--merge")}
            />
            <Action
              title="Rebase and Merge"
              icon={Icon.ArrowRight}
              onAction={() => void handleMergePR("--rebase")}
            />
            <Action
              title="Squash and Merge"
              icon={Icon.Layers}
              onAction={() => void handleMergePR("--squash")}
            />
          </ActionPanel.Submenu>
          <Action
            title="Close Pr"
            icon={Icon.XMarkCircle}
            style={Action.Style.Destructive}
            shortcut={{ modifiers: ["cmd"], key: "n" }}
            onAction={() => void handleClosePR()}
          />
        </>
      )}
      <Action
        title="Back"
        icon={Icon.ArrowLeft}
        shortcut={{ modifiers: ["cmd"], key: "[" }}
        onAction={pop}
      />
    </ActionPanel>
  );

  return (
    <List
      isShowingDetail
      navigationTitle={navigationTitle}
      selectedItemId={selectedReport.id}
      onSelectionChange={(id) => {
        if (id) setSelectedReportId(id);
      }}
    >
      {reportEntries.map((report, index) => (
        <List.Item
          key={report.id}
          id={report.id}
          icon={Icon.Document}
          title={formatReviewReportSelectTitle(report, index)}
          detail={<List.Item.Detail markdown={report.markdown} />}
          actions={reportActions}
        />
      ))}
    </List>
  );
}

function formatReviewReportSelectTitle(
  report: ReviewReportEntry,
  index: number,
) {
  const dateText =
    report.createdAt > 0 ? new Date(report.createdAt).toLocaleString() : "";
  return dateText ? `Report ${index + 1} - ${dateText}` : `Report ${index + 1}`;
}
