import {
  Action,
  ActionPanel,
  Detail,
  Icon,
  LaunchType,
  launchCommand,
  openExtensionPreferences,
  showToast,
  Toast,
} from "@raycast/api";
import { useCallback, useEffect, useState } from "react";
import {
  appendHolidayHint,
  getOffworkStatus,
  type OffworkStatus,
} from "./offwork";

export default function Command() {
  const [status, setStatus] = useState<OffworkStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const nextStatus = await getOffworkStatus();
      setStatus(nextStatus);
      setError(null);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : String(refreshError),
      );
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshRootSearchCountdown = useCallback(async (type: LaunchType) => {
    await launchCommand({
      name: "check-offwork",
      type,
    });
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30_000);

    return () => clearInterval(interval);
  }, [refresh]);

  async function enableBackgroundReminder() {
    await refreshRootSearchCountdown(LaunchType.UserInitiated);
  }

  async function handleRefresh() {
    setIsLoading(true);
    await refresh();
    await showToast({
      style: Toast.Style.Success,
      title: "Countdown refreshed",
    });
  }

  return (
    <Detail
      isLoading={isLoading}
      markdown={buildMarkdown(status, error)}
      actions={
        <ActionPanel>
          <Action
            title="Refresh"
            icon={Icon.ArrowClockwise}
            onAction={handleRefresh}
          />
          <Action
            title="刷新首页倒计时"
            icon={Icon.Bell}
            shortcut={{ modifiers: ["cmd"], key: "b" }}
            onAction={enableBackgroundReminder}
          />
          <Action
            title="Open Extension Preferences"
            icon={Icon.Gear}
            onAction={openExtensionPreferences}
          />
        </ActionPanel>
      }
      metadata={
        status && "calendar" in status ? (
          <CountdownMetadata status={status} />
        ) : undefined
      }
    />
  );
}

function CountdownMetadata({
  status,
}: {
  status: Extract<OffworkStatus, { calendar: unknown }>;
}) {
  return (
    <Detail.Metadata>
      <Detail.Metadata.Label title="Date" text={status.dateKey} />
      <Detail.Metadata.Label
        title="Work Start Time"
        text={status.workStartTime.label}
      />
      <Detail.Metadata.Label
        title="Lunch Time"
        text={appendHolidayHint(
          `${status.lunchStartTime.label} - ${status.lunchEndTime.label}`,
          status.holidayCountdown,
        )}
      />
      <Detail.Metadata.Label
        title="Offwork Time"
        text={status.offworkTime.label}
      />
      <Detail.Metadata.Label
        title="Workday Data"
        text={`holiday-cn ${status.calendar.year}`}
      />
      <Detail.Metadata.Label
        title="Cached At"
        text={new Date(status.calendar.fetchedAt).toLocaleString()}
      />
    </Detail.Metadata>
  );
}

function buildMarkdown(
  status: OffworkStatus | null,
  error: string | null,
): string {
  if (error) {
    return ["# 无法加载工作日数据", "", error, "", "请检查网络后刷新。"].join(
      "\n",
    );
  }

  if (!status) {
    return "# 正在计算下班倒计时";
  }

  if (status.type === "invalid-preference") {
    return ["# 时间配置无效", "", status.message].join("\n");
  }

  if (status.type === "non-workday") {
    return [
      appendHolidayHint("# 🎉 节假日，enjoy！", status.holidayCountdown),
      "",
      "不会发送下班提醒。",
    ].join("\n");
  }

  if (status.type === "before-work") {
    return [
      appendHolidayHint("# 🌿 非工作时间，wlb～", status.holidayCountdown),
      "",
      `上班时间：${status.workStartTime.label}`,
      `下班时间：${status.offworkTime.label}`,
    ].join("\n");
  }

  if (status.type === "lunch-time") {
    return [
      appendHolidayHint("# 🍱 lunch time，relax！", status.holidayCountdown),
      "",
      appendHolidayHint(
        `午休时间：${status.lunchStartTime.label} - ${status.lunchEndTime.label}`,
        status.holidayCountdown,
      ),
    ].join("\n");
  }

  if (status.type === "lunch-counting-down") {
    return [
      appendHolidayHint(
        `# 距午休还剩 ${status.remainingText}`,
        status.holidayCountdown,
      ),
      "",
      appendHolidayHint(
        `午休时间：${status.lunchStartTime.label} - ${status.lunchEndTime.label}`,
        status.holidayCountdown,
      ),
      `下班时间：${status.offworkTime.label}`,
    ].join("\n");
  }

  if (status.type === "counting-down") {
    return [
      appendHolidayHint(
        `# 还有 ${status.remainingText} 到下班`,
        status.holidayCountdown,
      ),
      "",
      `下班时间：${status.offworkTime.label}`,
      "",
      "后台提醒会在工作日下班时间附近触发一次。",
    ].join("\n");
  }

  return [
    appendHolidayHint("# 已到下班时间", status.holidayCountdown),
    "",
    `下班时间：${status.offworkTime.label}`,
  ].join("\n");
}
