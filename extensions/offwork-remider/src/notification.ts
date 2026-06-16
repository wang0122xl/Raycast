import { showHUD } from "@raycast/api";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function showOffworkNotification(
  offworkTime: string,
): Promise<void> {
  const title = "下班提醒";
  const message = `现在是 ${offworkTime}，该下班了。`;

  try {
    await execFileAsync("osascript", [
      "-e",
      `display notification "${escapeAppleScriptString(message)}" with title "${escapeAppleScriptString(title)}"`,
    ]);
  } catch {
    await showHUD(message);
  }
}

export async function showLunchNotification(
  lunchStartTime: string,
): Promise<void> {
  const title = "午休提醒";
  const message = `现在是 ${lunchStartTime}，该午休了。`;

  try {
    await execFileAsync("osascript", [
      "-e",
      `display notification "${escapeAppleScriptString(message)}" with title "${escapeAppleScriptString(title)}"`,
    ]);
  } catch {
    await showHUD(message);
  }
}

function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
