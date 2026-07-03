import { environment } from "@raycast/api";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import type { AppUpdate } from "./types";

export type ExcludedApp = AppUpdate & {
  filterKey: string;
  excludedAt: string;
};

const EXCLUDED_APPS_FILE = join(environment.supportPath, "excluded-apps.json");

export function getAppFilterKey(app: AppUpdate): string {
  if (app.bundleId) return `bundle:${app.bundleId}`;
  if (app.appPath) return `path:${app.appPath}`;
  return `source:${app.source}:name:${app.name.toLocaleLowerCase()}`;
}

function isExcludedApp(value: unknown): value is ExcludedApp {
  if (!value || typeof value !== "object") return false;

  const app = value as Partial<ExcludedApp>;
  return (
    typeof app.name === "string" &&
    typeof app.currentVersion === "string" &&
    typeof app.latestVersion === "string" &&
    typeof app.source === "string" &&
    typeof app.filterKey === "string" &&
    typeof app.excludedAt === "string"
  );
}

export async function getExcludedApps(): Promise<ExcludedApp[]> {
  try {
    const raw = await readFile(EXCLUDED_APPS_FILE, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isExcludedApp);
  } catch {
    return [];
  }
}

async function storeExcludedApps(apps: ExcludedApp[]): Promise<void> {
  await mkdir(environment.supportPath, { recursive: true });
  await writeFile(EXCLUDED_APPS_FILE, `${JSON.stringify(apps, null, 2)}\n`);
}

export async function excludeApp(app: AppUpdate): Promise<ExcludedApp[]> {
  const excludedApps = await getExcludedApps();
  const filterKey = getAppFilterKey(app);
  const next = excludedApps.filter((excludedApp) => excludedApp.filterKey !== filterKey);

  next.push({
    ...app,
    filterKey,
    excludedAt: new Date().toISOString(),
  });

  await storeExcludedApps(next);
  return next;
}

export async function removeExcludedApp(app: AppUpdate): Promise<ExcludedApp[]> {
  const filterKey = getAppFilterKey(app);
  const next = (await getExcludedApps()).filter((excludedApp) => excludedApp.filterKey !== filterKey);
  await storeExcludedApps(next);
  return next;
}

export function filterExcludedUpdates(updates: AppUpdate[], excludedApps: AppUpdate[]): AppUpdate[] {
  const excludedKeys = new Set(excludedApps.map(getAppFilterKey));
  return updates.filter((app) => !excludedKeys.has(getAppFilterKey(app)));
}
