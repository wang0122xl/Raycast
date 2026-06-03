import { execFile } from "child_process";
import { mkdir, mkdtemp, readdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { basename, extname, join } from "path";
import { promisify } from "util";
import type { Dirent } from "fs";
import type { AppUpdate } from "./types";

const execFileAsync = promisify(execFile);

const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const INSTALL_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_BUFFER = 1024 * 1024;
const RELAUNCH_DELAY_MS = 1000;

function shellQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function appleScriptString(value: string) {
  return JSON.stringify(value);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDownloadFilename(url: string) {
  try {
    const parsed = new URL(url);
    const name = basename(decodeURIComponent(parsed.pathname));
    if (name) return name;
  } catch {
    // Fall back to a generic name below.
  }

  return "sparkle-update";
}

async function downloadUpdate(url: string, destination: string) {
  await execFileAsync(
    "/usr/bin/curl",
    ["--fail", "--location", "--silent", "--show-error", "--output", destination, url],
    {
      timeout: DOWNLOAD_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
    },
  );
}

async function runShell(script: string) {
  await execFileAsync("/bin/sh", ["-c", script], {
    timeout: INSTALL_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
  });
}

async function runShellWithPrivileges(script: string) {
  await execFileAsync(
    "/usr/bin/osascript",
    ["-e", `do shell script ${appleScriptString(script)} with administrator privileges`],
    {
      timeout: INSTALL_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
    },
  );
}

async function runShellRetryingWithPrivileges(script: string) {
  try {
    await runShell(script);
  } catch {
    await runShellWithPrivileges(script);
  }
}

async function isAppRunning(bundleId?: string): Promise<boolean> {
  if (!bundleId) return false;

  try {
    const { stdout } = await execFileAsync("/usr/bin/osascript", [
      "-e",
      `tell application "System Events" to exists (application processes whose bundle identifier is ${appleScriptString(bundleId)})`,
    ]);

    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

async function quitApp(bundleId?: string) {
  if (!bundleId) return;

  await execFileAsync("/usr/bin/osascript", ["-e", `tell application id ${appleScriptString(bundleId)} to quit`]).catch(
    () => undefined,
  );
  await delay(RELAUNCH_DELAY_MS);
}

async function openApp(update: AppUpdate) {
  if (update.bundleId) {
    try {
      await execFileAsync("/usr/bin/open", ["-b", update.bundleId]);
      return;
    } catch {
      // Fall back to app path below.
    }
  }

  if (!update.appPath) throw new Error("Installed app path is missing");
  await execFileAsync("/usr/bin/open", [update.appPath]);
}

async function readDirectory(path: string): Promise<Dirent[]> {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function findFirstApp(root: string): Promise<string | null> {
  const entries = await readDirectory(root);

  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory() && entry.name.endsWith(".app")) return fullPath;
  }

  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (!entry.isDirectory()) continue;

    const nested = await findFirstApp(fullPath);
    if (nested) return nested;
  }

  return null;
}

async function findFirstPackage(root: string): Promise<string | null> {
  const entries = await readDirectory(root);

  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isFile() && (entry.name.endsWith(".pkg") || entry.name.endsWith(".mpkg"))) return fullPath;
  }

  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (!entry.isDirectory() || entry.name.endsWith(".app")) continue;

    const nested = await findFirstPackage(fullPath);
    if (nested) return nested;
  }

  return null;
}

async function installPackage(pkgPath: string) {
  const script = `/usr/sbin/installer -pkg ${shellQuote(pkgPath)} -target /`;
  await runShellRetryingWithPrivileges(script);
}

async function replaceAppBundle(sourceAppPath: string, targetAppPath?: string) {
  if (!targetAppPath) throw new Error("Installed app path is missing");
  if (!sourceAppPath.endsWith(".app") || !targetAppPath.endsWith(".app")) {
    throw new Error("Update package does not contain a valid app bundle");
  }

  const script = [
    "set -e",
    `if [ -e ${shellQuote(targetAppPath)} ]; then /bin/rm -rf ${shellQuote(targetAppPath)}; fi`,
    `/usr/bin/ditto ${shellQuote(sourceAppPath)} ${shellQuote(targetAppPath)}`,
  ].join("\n");

  await runShellRetryingWithPrivileges(script);
}

async function extractZip(zipPath: string, destination: string) {
  await mkdir(destination, { recursive: true });
  await execFileAsync("/usr/bin/ditto", ["-x", "-k", zipPath, destination], {
    timeout: INSTALL_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
  });
}

async function installExtractedUpdate(extractedPath: string, update: AppUpdate) {
  const pkgPath = await findFirstPackage(extractedPath);
  if (pkgPath) {
    await installPackage(pkgPath);
    return;
  }

  const appPath = await findFirstApp(extractedPath);
  if (!appPath) throw new Error("Update package does not contain an app bundle or installer package");

  await replaceAppBundle(appPath, update.appPath);
}

async function installDmg(dmgPath: string, update: AppUpdate, workDir: string) {
  const mountPath = join(workDir, "mount");
  await mkdir(mountPath, { recursive: true });

  await execFileAsync("/usr/bin/hdiutil", ["attach", "-nobrowse", "-readonly", "-mountpoint", mountPath, dmgPath], {
    timeout: INSTALL_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
  });

  try {
    await installExtractedUpdate(mountPath, update);
  } finally {
    await execFileAsync("/usr/bin/hdiutil", ["detach", mountPath], {
      timeout: INSTALL_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
    }).catch(() => undefined);
  }
}

async function installDownloadedUpdate(updatePath: string, update: AppUpdate, workDir: string) {
  const extension = extname(updatePath).toLowerCase();

  if (extension === ".pkg" || extension === ".mpkg") {
    await installPackage(updatePath);
    return;
  }

  if (extension === ".zip") {
    const extractedPath = join(workDir, "extracted");
    await extractZip(updatePath, extractedPath);
    await installExtractedUpdate(extractedPath, update);
    return;
  }

  if (extension === ".dmg") {
    await installDmg(updatePath, update, workDir);
    return;
  }

  throw new Error(`Unsupported Sparkle update package: ${extension || "unknown file type"}`);
}

export async function installSparkleUpdate(update: AppUpdate) {
  if (!update.downloadUrl) throw new Error("Sparkle update download URL is missing");

  const workDir = await mkdtemp(join(tmpdir(), "app-updates-"));
  const downloadPath = join(workDir, getDownloadFilename(update.downloadUrl));
  const shouldRelaunch = await isAppRunning(update.bundleId);

  try {
    await downloadUpdate(update.downloadUrl, downloadPath);
    if (shouldRelaunch) await quitApp(update.bundleId);
    await installDownloadedUpdate(downloadPath, update, workDir);
    if (shouldRelaunch || update.appPath) await openApp(update);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
