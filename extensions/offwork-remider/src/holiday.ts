import {
  getCalendarDayDifference,
  getDatesInYear,
  formatDateKey,
  isWeekday,
  parseDateKey,
} from "./time";
import {
  getWorkdayYearCache,
  saveWorkdayYearCache,
  type LegalHoliday,
  type WorkdayYearCache,
} from "./storage";

interface HolidayCnDay {
  name: string;
  date: string;
  isOffDay: boolean;
}

interface HolidayCnYear {
  year: number;
  papers: string[];
  days: HolidayCnDay[];
}

export type WorkdayCalendar = WorkdayYearCache;

const WORKDAY_CACHE_SCHEMA_VERSION = 2;

export interface LegalHolidayCountdown {
  daysUntil: number;
  name: string;
  date: string;
}

export async function getWorkdayCalendar(
  year: number,
): Promise<WorkdayCalendar> {
  const cached = await getWorkdayYearCache(year);
  if (cached && isCompleteCache(cached)) return cached;

  try {
    const holidayYear = await fetchHolidayCnYear(year);
    const calendar: WorkdayCalendar = {
      schemaVersion: WORKDAY_CACHE_SCHEMA_VERSION,
      year,
      fetchedAt: new Date().toISOString(),
      source: holidayYear.source,
      workdays: buildWorkdays(year, holidayYear.data),
      legalHolidays: buildLegalHolidays(holidayYear.data),
    };

    await saveWorkdayYearCache(calendar);
    return calendar;
  } catch (error) {
    if (cached) {
      return {
        ...cached,
        schemaVersion: WORKDAY_CACHE_SCHEMA_VERSION,
        legalHolidays: Array.isArray(cached.legalHolidays)
          ? cached.legalHolidays
          : [],
      };
    }

    throw error;
  }
}

export function isWorkday(calendar: WorkdayCalendar, date: Date): boolean {
  return calendar.workdays.includes(formatDateKey(date));
}

export async function getUpcomingLegalHolidayCountdown(
  date: Date,
  maxDaysExclusive: number,
  calendar: WorkdayCalendar,
): Promise<LegalHolidayCountdown | null> {
  const currentYearHoliday = findUpcomingLegalHoliday(
    calendar.legalHolidays,
    date,
    maxDaysExclusive,
  );
  if (currentYearHoliday) return currentYearHoliday;

  if (
    getCalendarDayDifference(date, new Date(date.getFullYear(), 11, 31)) >=
    maxDaysExclusive
  ) {
    return null;
  }

  const nextYearCalendar = await getWorkdayCalendar(date.getFullYear() + 1);
  return findUpcomingLegalHoliday(
    nextYearCalendar.legalHolidays,
    date,
    maxDaysExclusive,
  );
}

async function fetchHolidayCnYear(
  year: number,
): Promise<{ data: HolidayCnYear; source: string }> {
  const sources = getHolidayCnSources(year);
  const errors: string[] = [];

  for (const source of sources) {
    try {
      const response = await fetch(source);
      if (!response.ok) {
        errors.push(`${source}: ${response.status}`);
        continue;
      }

      return {
        data: parseHolidayCnYear(await response.json(), year),
        source,
      };
    } catch (error) {
      errors.push(
        `${source}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  throw new Error(
    `Unable to fetch holiday-cn data for ${year}. ${errors.join("; ")}`,
  );
}

function getHolidayCnSources(year: number): string[] {
  return [
    `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`,
    `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${year}.json`,
    `https://fastly.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${year}.json`,
  ];
}

function parseHolidayCnYear(
  value: unknown,
  expectedYear: number,
): HolidayCnYear {
  if (!isRecord(value)) {
    throw new Error("holiday-cn response is not an object");
  }

  if (value.year !== expectedYear) {
    throw new Error(
      `holiday-cn response year mismatch: expected ${expectedYear}, got ${String(value.year)}`,
    );
  }

  if (!Array.isArray(value.days)) {
    throw new Error("holiday-cn response is missing days");
  }

  const days = value.days.map((day) => {
    if (
      !isRecord(day) ||
      typeof day.name !== "string" ||
      typeof day.date !== "string"
    ) {
      throw new Error("holiday-cn response contains an invalid day");
    }

    if (typeof day.isOffDay !== "boolean") {
      throw new Error(`holiday-cn day ${day.date} is missing isOffDay`);
    }

    return {
      name: day.name,
      date: day.date,
      isOffDay: day.isOffDay,
    };
  });

  return {
    year: expectedYear,
    papers: Array.isArray(value.papers)
      ? value.papers.filter(
          (paper): paper is string => typeof paper === "string",
        )
      : [],
    days,
  };
}

function buildWorkdays(year: number, holidayYear: HolidayCnYear): string[] {
  const overrides = new Map(
    holidayYear.days.map((day) => [day.date, day.isOffDay]),
  );

  return getDatesInYear(year)
    .filter((date) => {
      const dateKey = formatDateKey(date);
      const isOffDay = overrides.get(dateKey);

      if (isOffDay !== undefined) {
        return !isOffDay;
      }

      return isWeekday(date);
    })
    .map(formatDateKey);
}

function buildLegalHolidays(holidayYear: HolidayCnYear): LegalHoliday[] {
  return holidayYear.days
    .filter((day) => day.isOffDay)
    .map((day) => ({
      date: day.date,
      name: day.name,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function findUpcomingLegalHoliday(
  legalHolidays: LegalHoliday[],
  date: Date,
  maxDaysExclusive: number,
): LegalHolidayCountdown | null {
  for (const holiday of legalHolidays) {
    const holidayDate = parseDateKey(holiday.date);
    if (!holidayDate) continue;

    const daysUntil = getCalendarDayDifference(date, holidayDate);
    if (daysUntil < 0) continue;
    if (daysUntil >= maxDaysExclusive) return null;

    return {
      daysUntil,
      name: holiday.name,
      date: holiday.date,
    };
  }

  return null;
}

function isCompleteCache(cache: WorkdayYearCache): boolean {
  return (
    cache.schemaVersion === WORKDAY_CACHE_SCHEMA_VERSION &&
    Array.isArray(cache.legalHolidays)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
