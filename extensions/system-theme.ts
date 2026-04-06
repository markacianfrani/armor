/**
 * Syncs pi theme with system appearance (dark/light mode).
 *
 * macOS:   Reads System Events appearance preferences via osascript.
 * Linux:   Reads Omarchy theme state (~/.config/omarchy/current/theme/light.mode),
 *          falling back to gsettings color-scheme if Omarchy isn't present.
 *
 * Automatically discovers the dark/light pair from loaded themes.
 * If the current theme is "flexoki-dark", it switches to "flexoki-light" and vice versa.
 * Works with any <base>-dark / <base>-light naming convention.
 *
 * Auto-discovered from ~/.pi/agent/extensions/
 */

import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const execAsync = promisify(exec);

const platform = process.platform;
const OMARCHY_THEME_DIR = join(homedir(), ".config", "omarchy", "current", "theme");

function findThemePair(themes: { name: string }[]): { dark: string; light: string } | null {
  const names = themes.map((t) => t.name);
  const darkTheme = names.find((n) => n.endsWith("-dark"));
  if (!darkTheme) {
    return null;
  }
  const base = darkTheme.slice(0, -5);
  const lightTheme = names.find((n) => n === `${base}-light`);
  if (!lightTheme) {
    return null;
  }
  return { dark: darkTheme, light: lightTheme };
}

async function isDarkMode(): Promise<boolean> {
  if (platform === "darwin") {
    try {
      const { stdout } = await execAsync(
        "osascript -e 'tell application \"System Events\" to tell appearance preferences to return dark mode'",
      );
      return stdout.trim() === "true";
    } catch {
      return true;
    }
  }

  // Linux: prefer Omarchy, fallback to gsettings
  if (existsSync(join(OMARCHY_THEME_DIR, "light.mode"))) {
    return false;
  }
  if (existsSync(join(OMARCHY_THEME_DIR, "ghostty.conf"))) {
    return true;
  }
  try {
    const { stdout } = await execAsync("gsettings get org.gnome.desktop.interface color-scheme");
    return stdout.trim() !== "'prefer-light'";
  } catch {
    return true;
  }
}

export default function (pi: ExtensionAPI) {
  let intervalId: ReturnType<typeof setInterval> | null = null;

  pi.on("session_start", async (_event, ctx) => {
    const pair = findThemePair(ctx.ui.getAllThemes());
    if (!pair) {
      return;
    }

    let currentIsDark = await isDarkMode();
    ctx.ui.setTheme(currentIsDark ? pair.dark : pair.light);

    intervalId = setInterval(async () => {
      const newIsDark = await isDarkMode();
      if (newIsDark !== currentIsDark) {
        currentIsDark = newIsDark;
        ctx.ui.setTheme(currentIsDark ? pair.dark : pair.light);
      }
    }, 2000);
  });

  pi.on("session_shutdown", () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  });
}
