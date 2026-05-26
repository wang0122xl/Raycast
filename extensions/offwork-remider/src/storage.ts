import { LocalStorage } from "@raycast/api";

export interface LegalHoliday {
  date: string;
  name: string;
}

export interface WorkdayYearCache {
  schemaVersion: number;
  year: number;
  fetchedAt: string;
  source: string;
  workdays: string[];
  legalHolidays: LegalHoliday[];
}

const WORKDAY_CACHE_PREFIX = "workday-cache:";
const LAST_NOTIFIED_DATE_KEY = "last-notified-date";
const LAST_ROOT_SEARCH_SUBTITLE_KEY = "last-root-search-subtitle";

export async function getWorkdayYearCache(
  year: number,
): Promise<WorkdayYearCache | null> {
  const value = await LocalStorage.getItem<string>(getWorkdayCacheKey(year));
  if (!value) return null;

  try {
    const cache = JSON.parse(value) as WorkdayYearCache;
    if (cache.year !== year || !Array.isArray(cache.workdays)) return null;
    return cache;
  } catch {
    return null;
  }
}

export async function saveWorkdayYearCache(
  cache: WorkdayYearCache,
): Promise<void> {
  await LocalStorage.setItem(
    getWorkdayCacheKey(cache.year),
    JSON.stringify(cache),
  );
}

export async function getLastNotifiedDate(): Promise<string | null> {
  return (await LocalStorage.getItem<string>(LAST_NOTIFIED_DATE_KEY)) ?? null;
}

export async function setLastNotifiedDate(dateKey: string): Promise<void> {
  await LocalStorage.setItem(LAST_NOTIFIED_DATE_KEY, dateKey);
}

export async function getLastRootSearchSubtitle(): Promise<string | null> {
  return (
    (await LocalStorage.getItem<string>(LAST_ROOT_SEARCH_SUBTITLE_KEY)) ?? null
  );
}

export async function setLastRootSearchSubtitle(value: string): Promise<void> {
  await LocalStorage.setItem(LAST_ROOT_SEARCH_SUBTITLE_KEY, value);
}

function getWorkdayCacheKey(year: number): string {
  return `${WORKDAY_CACHE_PREFIX}${year}`;
}
