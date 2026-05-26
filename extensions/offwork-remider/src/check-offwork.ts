import {
  environment,
  LaunchType,
  showHUD,
  updateCommandMetadata,
} from "@raycast/api";
import {
  getOffworkStatus,
  getOffworkStatusMessage,
  getRootSearchSubtitle,
  type ReminderResult,
  type OffworkStatus,
  maybeSendOffworkReminder,
} from "./offwork";
import {
  getLastRootSearchSubtitle,
  setLastRootSearchSubtitle,
} from "./storage";
import { getNextCountdownMinuteBoundaryTiming } from "./time";

const COUNTDOWN_ALIGNMENT_TOLERANCE_MS = 1_000;

export default async function Command() {
  const isUserInitiated = environment.launchType === LaunchType.UserInitiated;

  try {
    const { status, result } = await refreshCountdown();

    if (!isUserInitiated) {
      await refreshAtNextCountdownMinuteBoundary(status);
      return;
    }

    await showHUD(
      result.notified ? result.message : getOffworkStatusMessage(status),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateSubtitle("无法加载下班倒计时");

    if (isUserInitiated) {
      await showHUD(message);
      return;
    }

    console.error(message);
  }
}

async function refreshCountdown(): Promise<{
  status: OffworkStatus;
  result: ReminderResult;
}> {
  const status = await getOffworkStatus();
  await updateSubtitle(getRootSearchSubtitle(status));
  const result = await maybeSendOffworkReminder(status);

  return { status, result };
}

async function updateSubtitle(subtitle: string): Promise<void> {
  if ((await getLastRootSearchSubtitle()) === subtitle) return;

  await updateCommandMetadata({ subtitle });
  await setLastRootSearchSubtitle(subtitle);
}

async function refreshAtNextCountdownMinuteBoundary(
  status: OffworkStatus,
): Promise<void> {
  if (status.type !== "counting-down") return;

  const timing = getNextCountdownMinuteBoundaryTiming(
    new Date(),
    status.offworkTime,
  );
  if (!timing) return;

  if (
    timing.delayMs > COUNTDOWN_ALIGNMENT_TOLERANCE_MS &&
    timing.deviationMs <= COUNTDOWN_ALIGNMENT_TOLERANCE_MS
  ) {
    return;
  }

  await wait(timing.delayMs);
  await refreshCountdown();
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
