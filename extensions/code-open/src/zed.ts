import { spawn } from "child_process";
import { existsSync } from "fs";

const INSTALLED_ZED_CLI = "/usr/local/bin/zed";
const ZED_APP_CLI = "/Applications/Zed.app/Contents/MacOS/cli";
const ZED_PREVIEW_APP_CLI = "/Applications/Zed Preview.app/Contents/MacOS/cli";
const EXTENDED_PATH = `/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:${process.env.PATH ?? ""}`;
const PANEL_FOCUS_MAX_ATTEMPTS = 20;
const PANEL_FOCUS_POLL_SECONDS = 0.05;
const PANEL_FOCUS_SETTLE_SECONDS = 0.2;

export type ZedPanel = "project" | "git";

const PANEL_SHORTCUTS: Record<ZedPanel, { key: string; modifiers: string[] }> =
  {
    project: {
      key: "e",
      modifiers: ["command down", "shift down"],
    },
    git: {
      key: "g",
      modifiers: ["control down", "shift down"],
    },
  };

function getZedCliCommand(): string {
  if (existsSync(INSTALLED_ZED_CLI)) return INSTALLED_ZED_CLI;
  if (existsSync(ZED_APP_CLI)) return ZED_APP_CLI;
  if (existsSync(ZED_PREVIEW_APP_CLI)) return ZED_PREVIEW_APP_CLI;
  return "zed";
}

function getZedApplicationName(): string {
  if (!existsSync(ZED_APP_CLI) && existsSync(ZED_PREVIEW_APP_CLI)) {
    return "Zed Preview";
  }

  return "Zed";
}

function spawnDetached(command: string, args: string[]): void {
  const child = spawn(command, args, {
    detached: true,
    env: { ...process.env, PATH: EXTENDED_PATH },
    stdio: "ignore",
  });

  child.on("error", () => undefined);
  child.unref();
}

function getPanelFocusScript(panel: ZedPanel): string {
  const shortcut = PANEL_SHORTCUTS[panel];
  const zedApplicationName = getZedApplicationName();

  return `
tell application ${JSON.stringify(zedApplicationName)} to activate

tell application "System Events"
  repeat ${PANEL_FOCUS_MAX_ATTEMPTS} times
    if exists process ${JSON.stringify(zedApplicationName)} then
      if frontmost of process ${JSON.stringify(zedApplicationName)} then exit repeat
    end if
    delay ${PANEL_FOCUS_POLL_SECONDS}
  end repeat
end tell

delay ${PANEL_FOCUS_SETTLE_SECONDS}

tell application "System Events"
  keystroke ${JSON.stringify(shortcut.key)} using {${shortcut.modifiers.join(", ")}}
end tell
`;
}

export function openZedProject(
  projectPath: string,
  options: { panel: ZedPanel },
): boolean {
  try {
    spawnDetached(getZedCliCommand(), [projectPath]);
    spawnDetached("osascript", ["-e", getPanelFocusScript(options.panel)]);
    return true;
  } catch {
    return false;
  }
}
