import { getPreferenceValues } from "@raycast/api";
import {
  getUpcomingLegalHolidayCountdown,
  getWorkdayCalendar,
  isWorkday,
  type LegalHolidayCountdown,
  type WorkdayCalendar,
} from "./holiday";
import { showOffworkNotification } from "./notification";
import { getLastNotifiedDate, setLastNotifiedDate } from "./storage";
import {
  DEFAULT_OFFWORK_TIME,
  formatDateKey,
  formatDuration,
  getMinutesPastOffwork,
  getRemainingMinutes,
  parseOffworkTime,
  type OffworkTime,
} from "./time";

const NOTIFICATION_WINDOW_MINUTES = 30;
const HOLIDAY_HINT_MAX_DAYS = 30;

export type OffworkStatus =
  | {
      type: "invalid-preference";
      message: string;
    }
  | {
      type: "non-workday";
      dateKey: string;
      offworkTime: OffworkTime;
      calendar: WorkdayCalendar;
      holidayCountdown: LegalHolidayCountdown | null;
    }
  | {
      type: "counting-down";
      dateKey: string;
      offworkTime: OffworkTime;
      calendar: WorkdayCalendar;
      remainingMinutes: number;
      remainingText: string;
      holidayCountdown: LegalHolidayCountdown | null;
    }
  | {
      type: "offwork-reached";
      dateKey: string;
      offworkTime: OffworkTime;
      calendar: WorkdayCalendar;
      minutesPastOffwork: number;
      holidayCountdown: LegalHolidayCountdown | null;
    };

export interface ReminderResult {
  notified: boolean;
  message: string;
}

export function getOffworkStatusMessage(status: OffworkStatus): string {
  if (status.type === "invalid-preference") {
    return status.message;
  }

  if (status.type === "non-workday") {
    return "今天不是工作日。";
  }

  if (status.type === "counting-down") {
    return `距离下班还有 ${status.remainingText}。`;
  }

  return "已到下班时间。";
}

export function getRootSearchSubtitle(status: OffworkStatus): string {
  if (status.type === "invalid-preference") {
    return "⚠️ HH:mm";
  }

  if (status.type === "non-workday") {
    return appendHolidayHint("🌙 非工作日", status.holidayCountdown);
  }

  if (status.type === "counting-down") {
    return appendHolidayHint(
      `⏳ ${status.remainingText}`,
      status.holidayCountdown,
    );
  }

  return appendHolidayHint("✅ 00:00", status.holidayCountdown);
}

export async function getOffworkStatus(
  now = new Date(),
): Promise<OffworkStatus> {
  const { offworkTime: configuredOffworkTime = DEFAULT_OFFWORK_TIME } =
    getPreferenceValues<Preferences>();
  const offworkTime = parseOffworkTime(configuredOffworkTime);

  if (!offworkTime) {
    return {
      type: "invalid-preference",
      message: `下班时间必须使用 24 小时制 HH:mm 格式，例如 ${DEFAULT_OFFWORK_TIME}。`,
    };
  }

  const calendar = await getWorkdayCalendar(now.getFullYear());
  const dateKey = formatDateKey(now);
  const holidayCountdown = await getHolidayCountdownSafely(now, calendar);

  if (!isWorkday(calendar, now)) {
    return {
      type: "non-workday",
      dateKey,
      offworkTime,
      calendar,
      holidayCountdown,
    };
  }

  const remainingMinutes = getRemainingMinutes(now, offworkTime);

  if (remainingMinutes > 0) {
    return {
      type: "counting-down",
      dateKey,
      offworkTime,
      calendar,
      remainingMinutes,
      remainingText: formatDuration(remainingMinutes),
      holidayCountdown,
    };
  }

  return {
    type: "offwork-reached",
    dateKey,
    offworkTime,
    calendar,
    minutesPastOffwork: getMinutesPastOffwork(now, offworkTime),
    holidayCountdown,
  };
}

export async function maybeSendOffworkReminder(
  status?: OffworkStatus,
): Promise<ReminderResult> {
  const currentStatus = status ?? (await getOffworkStatus());

  if (currentStatus.type === "invalid-preference") {
    return { notified: false, message: currentStatus.message };
  }

  if (currentStatus.type === "non-workday") {
    return { notified: false, message: "今天不是工作日，不发送提醒。" };
  }

  if (currentStatus.type === "counting-down") {
    return {
      notified: false,
      message: getOffworkStatusMessage(currentStatus),
    };
  }

  if (currentStatus.minutesPastOffwork > NOTIFICATION_WINDOW_MINUTES) {
    return { notified: false, message: "已超过下班提醒窗口，不发送过期提醒。" };
  }

  const lastNotifiedDate = await getLastNotifiedDate();
  if (lastNotifiedDate === currentStatus.dateKey) {
    return { notified: false, message: "今天已经发送过下班提醒。" };
  }

  await showOffworkNotification(currentStatus.offworkTime.label);
  await setLastNotifiedDate(currentStatus.dateKey);

  return { notified: true, message: "下班提醒已发送。" };
}

function appendHolidayHint(
  value: string,
  holidayCountdown: LegalHolidayCountdown | null,
): string {
  if (!holidayCountdown) return value;

  return `${value}（${holidayCountdown.daysUntil}天后${holidayCountdown.name}）`;
}

async function getHolidayCountdownSafely(
  now: Date,
  calendar: WorkdayCalendar,
): Promise<LegalHolidayCountdown | null> {
  try {
    return await getUpcomingLegalHolidayCountdown(
      now,
      HOLIDAY_HINT_MAX_DAYS,
      calendar,
    );
  } catch (error) {
    console.error(error);
    return null;
  }
}
