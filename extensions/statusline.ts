/**
 * Minimal Footer Extension
 *
 * ▎██░░░░░░░ 23%                armor · main · glm-5.1
 *
 * Left:  colored accent marker + context bar + percentage
 * Right: cwd · branch · model
 *
 * Context threshold colors:
 *   <40% green  <60% yellow  <80% orange  80%+ red
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { basename } from "node:path";

// -- ANSI helpers --

function rgb(hex: string): string {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `${r};${g};${b}`;
}

function fg(hex: string, text: string): string {
	return `\x1b[38;2;${rgb(hex)}m${text}\x1b[0m`;
}

// -- Colors (flexoki) --

const DIM = "#6F6E69"; // base-600
const CWD = "#9F9D96"; // base-400

function contextColor(pct: number): string {
	if (pct < 40) return "#879A39";
	if (pct < 60) return "#D0A215";
	if (pct < 80) return "#DA702C";
	return "#D14D41";
}

// -- Render pieces --

function renderBar(percent: number): string {
	const color = contextColor(percent);
	const barWidth = 10;
	const filled = Math.round((percent / 100) * barWidth);
	return fg(color, "▎") + fg(color, "█".repeat(filled)) + fg(DIM, "░".repeat(barWidth - filled));
}

function renderContextPercent(percent: number | null): string {
	if (percent == null) return fg(contextColor(0), "—");
	const color = contextColor(percent);
	return fg(color, `${Math.round(percent)}%`);
}

function renderLeft(percent: number | null): string {
	const pctVal = percent ?? 0;
	return renderBar(pctVal) + " " + renderContextPercent(percent);
}

function renderRight(branch: string | null, model: string, cwd: string, maxWidth: number): string {
	const sep = ` ${fg(DIM, "·")} `;
	const cwdPart = fg(CWD, cwd);
	const modelPart = fg(DIM, model);

	// Always show cwd and model, truncate branch to fit
	const fixed = cwdPart + sep + modelPart;
	const fixedW = visibleWidth(fixed);
	const sepW = visibleWidth(sep);

	if (!branch) return truncateToWidth(fixed, maxWidth);

	const available = maxWidth - fixedW - sepW;
	const branchText = available > 3 ? truncateToWidth(branch, available, "…") : "";
	if (!branchText) return truncateToWidth(fixed, maxWidth);

	return truncateToWidth(cwdPart + sep + fg(DIM, branchText) + sep + modelPart, maxWidth);
}

function padBetween(left: string, right: string, width: number): string {
	const contentW = visibleWidth(left) + 1 + visibleWidth(right);
	return " ".repeat(Math.max(1, width - contentW));
}

// -- Extension --

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

					const left = renderLeft(percent);
					const leftW = visibleWidth(left);
					const right = renderRight(branch, model, dir, width - leftW - 1);
					const pad = padBetween(left, right, width);

					return [truncateToWidth(left + pad + right, width)];
				},
			};
		});
	});
}
