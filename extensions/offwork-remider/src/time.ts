export interface OffworkTime {
  hours: number;
  minutes: number;
  label: string;
  minutesOfDay: number;
}

export const DEFAULT_OFFWORK_TIME = "18:00";

const MINUTE_MS = 60_000;
const OFFWORK_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface CountdownMinuteBoundaryTiming {
  delayMs: number;
  deviationMs: number;
}

export function parseOffworkTime(
  value: string | undefined,
): OffworkTime | null {
  const normalized = value?.trim() || DEFAULT_OFFWORK_TIME;
  const match = OFFWORK_TIME_PATTERN.exec(normalized);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  return {
    hours,
    minutes,
    label: `${match[1]}:${match[2]}`,
    minutesOfDay: hours * 60 + minutes,
  };
}

export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function parseDateKey(dateKey: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function getCalendarDayDifference(from: Date, to: Date): number {
  const fromStart = new Date(from);
  const toStart = new Date(to);
  fromStart.setHours(0, 0, 0, 0);
  toStart.setHours(0, 0, 0, 0);

  return Math.round((toStart.getTime() - fromStart.getTime()) / 86_400_000);
}

export function getOffworkDate(date: Date, offworkTime: OffworkTime): Date {
  const result = new Date(date);
  result.setHours(offworkTime.hours, offworkTime.minutes, 0, 0);
  return result;
}

export function getNextCountdownMinuteBoundaryTiming(
  now: Date,
  offworkTime: OffworkTime,
): CountdownMinuteBoundaryTiming | null {
  const offworkAt = getOffworkDate(now, offworkTime);
  const remainingMs = offworkAt.getTime() - now.getTime();
  if (remainingMs <= 0) return null;

  const remainderMs = remainingMs % MINUTE_MS;
  const delayMs = remainderMs === 0 ? MINUTE_MS : remainderMs;
  const msSinceLastBoundary = MINUTE_MS - delayMs;

  return {
    delayMs,
    deviationMs: Math.min(delayMs, msSinceLastBoundary),
  };
}

export function getRemainingMinutes(
  now: Date,
  offworkTime: OffworkTime,
): number {
  const offworkAt = getOffworkDate(now, offworkTime);
  return Math.max(
    0,
    Math.ceil((offworkAt.getTime() - now.getTime()) / MINUTE_MS),
  );
}

export function getMinutesPastOffwork(
  now: Date,
  offworkTime: OffworkTime,
): number {
  const offworkAt = getOffworkDate(now, offworkTime);
  return Math.floor((now.getTime() - offworkAt.getTime()) / MINUTE_MS);
}

export function formatDuration(totalMinutes: number): string {
  const safeMinutes = Math.max(0, totalMinutes);
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

export function getDatesInYear(year: number): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(year, 0, 1);

  while (cursor.getFullYear() === year) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}
