import { getPreferenceValues } from "@raycast/api";
import {
  getUpcomingLegalHolidayCountdown,
  getWorkdayCalendar,
  isWorkday,
  type LegalHolidayCountdown,
  type WorkdayCalendar,
} from "./holiday";
import { showLunchNotification, showOffworkNotification } from "./notification";
import {
  getLastLunchNotifiedDate,
  getLastNotifiedDate,
  setLastLunchNotifiedDate,
  setLastNotifiedDate,
} from "./storage";
import {
  DEFAULT_LUNCH_END_TIME,
  DEFAULT_LUNCH_START_TIME,
  DEFAULT_OFFWORK_TIME,
  DEFAULT_WORK_START_TIME,
  formatDateKey,
  formatDuration,
  getCurrentMinutesOfDay,
  getMinutesPastOffwork,
  getRemainingMinutes,
  parseOffworkTime,
  parseScheduleTime,
  type OffworkTime,
} from "./time";

const NOTIFICATION_WINDOW_MINUTES = 30;
const HOLIDAY_HINT_MAX_DAYS = 180;

interface SchedulePreferences {
  workStartTime?: string;
  lunchStartTime?: string;
  lunchEndTime?: string;
  offworkTime?: string;
}

interface WorkSchedule {
  workStartTime: OffworkTime;
  lunchStartTime: OffworkTime;
  lunchEndTime: OffworkTime;
  offworkTime: OffworkTime;
}

interface CalendarStatusBase extends WorkSchedule {
  dateKey: string;
  calendar: WorkdayCalendar;
  holidayCountdown: LegalHolidayCountdown | null;
}

export type OffworkStatus =
  | {
      type: "invalid-preference";
      message: string;
    }
  | ({
      type: "non-workday";
    } & CalendarStatusBase)
  | ({
      type: "before-work";
    } & CalendarStatusBase)
  | ({
      type: "lunch-time";
      minutesPastLunchStart: number;
    } & CalendarStatusBase)
  | ({
      type: "lunch-counting-down";
      remainingMinutes: number;
      remainingText: string;
    } & CalendarStatusBase)
  | ({
      type: "counting-down";
      remainingMinutes: number;
      remainingText: string;
    } & CalendarStatusBase)
  | ({
      type: "offwork-reached";
      minutesPastOffwork: number;
    } & CalendarStatusBase);

export interface ReminderResult {
  notified: boolean;
  message: string;
}

export function getOffworkStatusMessage(status: OffworkStatus): string {
  if (status.type === "invalid-preference") {
    return status.message;
  }

  let message: string;

  if (status.type === "non-workday") {
    message = "🎉 节假日，enjoy！";
  } else if (
    status.type === "before-work" ||
    status.type === "offwork-reached"
  ) {
    message = "🌿 非工作时间，wlb～";
  } else if (status.type === "lunch-time") {
    message = "🍱 lunch time，relax！";
  } else if (status.type === "lunch-counting-down") {
    message = `距午休还剩 ${status.remainingText}。`;
  } else if (status.type === "counting-down") {
    message = `距离下班还有 ${status.remainingText}。`;
  } else {
    message = "已到下班时间。";
  }

  return appendHolidayHint(message, status.holidayCountdown);
}

export function getRootSearchSubtitle(status: OffworkStatus): string {
  if (status.type === "invalid-preference") {
    return "⚠️ HH:mm";
  }

  if (status.type === "non-workday") {
    return appendHolidayHint("🎉 节假日，enjoy！", status.holidayCountdown);
  }

  if (status.type === "before-work" || status.type === "offwork-reached") {
    return appendHolidayHint("🌿 非工作时间，wlb～", status.holidayCountdown);
  }

  if (status.type === "lunch-time") {
    return appendHolidayHint("🍱 lunch time，relax！", status.holidayCountdown);
  }

  if (status.type === "lunch-counting-down") {
    return appendHolidayHint(
      `🍱 距午休还剩 ${status.remainingText}`,
      status.holidayCountdown,
    );
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
  const {
    workStartTime: configuredWorkStartTime = DEFAULT_WORK_START_TIME,
    lunchStartTime: configuredLunchStartTime = DEFAULT_LUNCH_START_TIME,
    lunchEndTime: configuredLunchEndTime = DEFAULT_LUNCH_END_TIME,
    offworkTime: configuredOffworkTime = DEFAULT_OFFWORK_TIME,
  } = getPreferenceValues<SchedulePreferences>();
  const workStartTime = parseScheduleTime(
    configuredWorkStartTime,
    DEFAULT_WORK_START_TIME,
  );
  const lunchStartTime = parseScheduleTime(
    configuredLunchStartTime,
    DEFAULT_LUNCH_START_TIME,
  );
  const lunchEndTime = parseScheduleTime(
    configuredLunchEndTime,
    DEFAULT_LUNCH_END_TIME,
  );
  const offworkTime = parseOffworkTime(configuredOffworkTime);

  if (!workStartTime || !lunchStartTime || !lunchEndTime || !offworkTime) {
    return {
      type: "invalid-preference",
      message: "上班、午休和下班时间必须使用 24 小时制 HH:mm 格式。",
    };
  }

  if (
    workStartTime.minutesOfDay >= lunchStartTime.minutesOfDay ||
    lunchStartTime.minutesOfDay >= lunchEndTime.minutesOfDay ||
    lunchEndTime.minutesOfDay >= offworkTime.minutesOfDay
  ) {
    return {
      type: "invalid-preference",
      message: "时间顺序必须满足：上班时间 < 午休开始 < 午休结束 < 下班时间。",
    };
  }

  const calendar = await getWorkdayCalendar(now.getFullYear());
  const dateKey = formatDateKey(now);
  const holidayCountdown = await getHolidayCountdownSafely(now, calendar);
  const base = {
    dateKey,
    workStartTime,
    lunchStartTime,
    lunchEndTime,
    offworkTime,
    calendar,
    holidayCountdown,
  };

  if (!isWorkday(calendar, now)) {
    return {
      type: "non-workday",
      ...base,
    };
  }

  const currentMinutesOfDay = getCurrentMinutesOfDay(now);

  if (currentMinutesOfDay >= offworkTime.minutesOfDay) {
    return {
      type: "offwork-reached",
      ...base,
      minutesPastOffwork: getMinutesPastOffwork(now, offworkTime),
    };
  }

  if (
    currentMinutesOfDay >= lunchStartTime.minutesOfDay &&
    currentMinutesOfDay < lunchEndTime.minutesOfDay
  ) {
    return {
      type: "lunch-time",
      ...base,
      minutesPastLunchStart: getMinutesPastOffwork(now, lunchStartTime),
    };
  }

  const remainingMinutes = getRemainingMinutes(now, offworkTime);

  return {
    type: "counting-down",
    ...base,
    remainingMinutes,
    remainingText: formatDuration(remainingMinutes),
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
    return {
      notified: false,
      message: appendHolidayHint(
        "今天不是工作日，不发送提醒。",
        currentStatus.holidayCountdown,
      ),
    };
  }

  if (currentStatus.type === "lunch-time") {
    if (currentStatus.minutesPastLunchStart > NOTIFICATION_WINDOW_MINUTES) {
      return {
        notified: false,
        message: appendHolidayHint(
          "已超过午休提醒窗口，不发送过期提醒。",
          currentStatus.holidayCountdown,
        ),
      };
    }

    const lastLunchNotifiedDate = await getLastLunchNotifiedDate();
    if (lastLunchNotifiedDate === currentStatus.dateKey) {
      return {
        notified: false,
        message: appendHolidayHint(
          "今天已经发送过午休提醒。",
          currentStatus.holidayCountdown,
        ),
      };
    }

    await setLastLunchNotifiedDate(currentStatus.dateKey);
    await showLunchNotification(currentStatus.lunchStartTime.label);

    return {
      notified: true,
      message: appendHolidayHint(
        "午休提醒已发送。",
        currentStatus.holidayCountdown,
      ),
    };
  }

  if (
    currentStatus.type === "before-work" ||
    currentStatus.type === "lunch-counting-down" ||
    currentStatus.type === "counting-down"
  ) {
    return {
      notified: false,
      message: getOffworkStatusMessage(currentStatus),
    };
  }

  if (currentStatus.minutesPastOffwork > NOTIFICATION_WINDOW_MINUTES) {
    return {
      notified: false,
      message: appendHolidayHint(
        "已超过下班提醒窗口，不发送过期提醒。",
        currentStatus.holidayCountdown,
      ),
    };
  }

  const lastNotifiedDate = await getLastNotifiedDate();
  if (lastNotifiedDate === currentStatus.dateKey) {
    return {
      notified: false,
      message: appendHolidayHint(
        "今天已经发送过下班提醒。",
        currentStatus.holidayCountdown,
      ),
    };
  }

  await setLastNotifiedDate(currentStatus.dateKey);
  await showOffworkNotification(currentStatus.offworkTime.label);

  return {
    notified: true,
    message: appendHolidayHint(
      "下班提醒已发送。",
      currentStatus.holidayCountdown,
    ),
  };
}

export function appendHolidayHint(
  value: string,
  holidayCountdown: LegalHolidayCountdown | null,
): string {
  if (!holidayCountdown) return value;

  return `${value}（距离${holidayCountdown.name}还有${holidayCountdown.daysUntil}天）`;
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
