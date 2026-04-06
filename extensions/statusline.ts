/**
 * Minimal Footer Extension
 *
 * ▎██░░░░░░░ 23%              armor · main · gpt-5.4 · ████░░│██░░░░
 *
 * Left:  colored accent marker + context bar + percentage
 * Right: cwd · branch · model · [usage bars from provider extensions]
 *
 * Context threshold colors:
 *   <40% green  <60% yellow  <80% orange  80%+ red
 *
 * ── Usage provider contract ──
 *
 * Provider extensions (e.g. statusline-codex.ts) publish usage data
 * via ctx.ui.setStatus() and this footer renders it as bars.
 *
 * To add a new provider, create extensions/statusline-<provider>.ts:
 *
 *   1. Match your provider:  model.provider === "<provider-name>"
 *   2. Fetch usage data from your provider's API
 *   3. Publish:  ctx.ui.setStatus("usage:<provider>", JSON.stringify(data))
 *   4. Clear:    ctx.ui.setStatus("usage:<provider>", undefined)
 *
 * Data shape (JSON):
 *
 *   {
 *     "windows": [
 *       { "usedPercent": 61, "resetAt": 1749235200 },  // unix seconds, optional
 *       { "usedPercent": 18 }
 *     ]
 *   }
 *
 * Windows are rendered left-to-right as bars separated by │.
 * At ≥95% used, the bar is replaced with ⧖ + countdown to resetAt.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { basename } from "node:path";

// ── ANSI helpers ──

function rgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r};${g};${b}`;
}

function fg(hex: string, text: string): string {
  return `\x1b[38;2;${rgb(hex)}m${text}\x1b[0m`;
}

// ── Colors (flexoki) ──

const DIM = "#6F6E69"; // base-600
const CWD = "#9F9D96"; // base-400

function contextColor(pct: number): string {
  if (pct < 40) {
    return "#879A39";
  }
  if (pct < 60) {
    return "#D0A215";
  }
  if (pct < 80) {
    return "#DA702C";
  }
  return "#D14D41";
}

// ── Context bar ──

function clampBarPercent(percent: number): number {
  if (!Number.isFinite(percent)) {
    return 0;
  }
  return Math.max(0, Math.min(percent, 100));
}

function renderBar(percent: number): string {
  const color = contextColor(percent);
  const barWidth = 10;
  const safePercent = clampBarPercent(percent);
  const filled = Math.round((safePercent / 100) * barWidth);
  return fg(color, "▎") + fg(color, "█".repeat(filled)) + fg(DIM, "░".repeat(barWidth - filled));
}

function renderContextPercent(percent: number | null): string {
  if (percent === null || percent === undefined) {
    return fg(contextColor(0), "—");
  }
  const color = contextColor(percent);
  return fg(color, `${Math.round(percent)}%`);
}

function renderLeft(percent: number | null): string {
  const pctVal = percent ?? 0;
  return renderBar(pctVal) + " " + renderContextPercent(percent);
}

// ── Usage rendering (generic, reads from provider extension statuses) ──

interface UsageWindow {
  usedPercent: number;
  resetAt?: number;
}

interface UsageData {
  windows: UsageWindow[];
}

const FULL_THRESHOLD = 95;

function formatCountdown(resetAt: number | undefined): string | undefined {
  if (resetAt === undefined) {
    return undefined;
  }
  const ms = resetAt * 1000 - Date.now();
  if (ms <= 0) {
    return undefined;
  }
  const mins = Math.ceil(ms / 60_000);
  if (mins < 60) {
    return `${mins}m`;
  }
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

function renderWindow(window: UsageWindow, barWidth: number): string {
  const pct = clampBarPercent(Math.round(window.usedPercent));
  const color = contextColor(pct);

  if (pct >= FULL_THRESHOLD) {
    const countdown = formatCountdown(window.resetAt);
    if (countdown) {
      return fg(color, "⧖ " + countdown);
    }
    return fg(color, "█".repeat(barWidth));
  }

  const filled = Math.round((pct / 100) * barWidth);
  return fg(color, "█".repeat(filled)) + fg(DIM, "░".repeat(barWidth - filled));
}

function renderUsageSegment(data: UsageData, maxWidth: number): string {
  const windows = data.windows;
  if (windows.length === 0) {
    return "";
  }

  const div = fg(DIM, "│");

  if (windows.length >= 2) {
    const a = windows[0],
      b = windows[1];
    const full = renderWindow(a, 6) + div + renderWindow(b, 6);
    if (visibleWidth(full) <= maxWidth) {
      return full;
    }

    const med = renderWindow(a, 5) + div + renderWindow(b, 5);
    if (visibleWidth(med) <= maxWidth) {
      return med;
    }

    const sm = renderWindow(a, 4) + div + renderWindow(b, 4);
    if (visibleWidth(sm) <= maxWidth) {
      return sm;
    }
  }

  const single = windows[0];
  const one = renderWindow(single, 6);
  if (visibleWidth(one) <= maxWidth) {
    return one;
  }

  const tiny = renderWindow(single, 4);
  if (visibleWidth(tiny) <= maxWidth) {
    return tiny;
  }

  return "";
}

function parseUsageStatus(statuses: ReadonlyMap<string, string>): UsageData | undefined {
  for (const [key, value] of statuses) {
    if (!key.startsWith("usage:")) {
      continue;
    }
    try {
      const data = JSON.parse(value) as UsageData;
      if (data.windows?.length > 0) {
        return data;
      }
    } catch {}
  }
  return undefined;
}

// ── Right side layout ──

function renderRight(
  branch: string | null,
  model: string,
  cwd: string,
  usage: UsageData | undefined,
  maxWidth: number,
): string {
  const sep = ` ${fg(DIM, "·")} `;
  const cwdPart = fg(CWD, cwd);
  const modelPart = fg(DIM, model);
  const sepW = visibleWidth(sep);

  const baseStr = cwdPart + sep + modelPart;
  const baseW = visibleWidth(baseStr);

  let usagePart = "";
  if (usage) {
    const budget = maxWidth - baseW - sepW;
    if (budget > 4) {
      usagePart = renderUsageSegment(usage, budget);
    }
  }

  const tail = usagePart ? modelPart + sep + usagePart : modelPart;

  if (!branch) {
    return truncateToWidth(cwdPart + sep + tail, maxWidth);
  }

  const usedW = visibleWidth(cwdPart + sep + tail) + sepW;
  const available = maxWidth - usedW;
  const branchText = available > 3 ? truncateToWidth(branch, available, "...") : "";

  if (!branchText) {
    return truncateToWidth(cwdPart + sep + tail, maxWidth);
  }

  return truncateToWidth(cwdPart + sep + fg(DIM, branchText) + sep + tail, maxWidth);
}

function padBetween(left: string, right: string, width: number): string {
  const contentW = visibleWidth(left) + 1 + visibleWidth(right);
  return " ".repeat(Math.max(1, width - contentW));
}

// ── Extension ──

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setFooter((tui, _theme, footerData) => {
      const unsub = footerData.onBranchChange(() => tui.requestRender());

      return {
        dispose: unsub,
        invalidate() {},
        render(width: number): string[] {
          const percent = ctx.getContextUsage()?.percent ?? null;
          const branch = footerData.getGitBranch();
          const model = ctx.model?.id?.split("/").pop() ?? "?";
          const dir = basename(ctx.cwd);

          const usage = parseUsageStatus(footerData.getExtensionStatuses());

          const left = renderLeft(percent);
          const leftW = visibleWidth(left);
          const right = renderRight(branch, model, dir, usage, width - leftW - 1);
          const pad = padBetween(left, right, width);

          return [truncateToWidth(left + pad + right, width)];
        },
      };
    });
  });
}
