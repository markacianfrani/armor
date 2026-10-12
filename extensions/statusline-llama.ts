/**
 * llama.cpp speed line for the statusline + editor area.
 *
 * While the model streams (above the editor):
 *
 *   ∿ 1.8s…            prefill, counting up; color ramps green→yellow→orange→red
 *   ∿ 1.8s · 30 t/s    started — the count froze (TTFT), rate joins it
 *
 * The ms/s on the left is the prompt-processing cost of the call (frozen when
 * the first token lands); the t/s is decode rate. Two numbers, two colors:
 * red-left + green-right = "slow start, fine now".
 *
 * Idle: the line is removed and the armor footer carries the last call:
 *
 *   armor · main · qwen3.8-27b · ∿ 41.2 t/s
 *
 * Publishes through the usage provider contract (see statusline.ts) as
 * `usage:llama.cpp` with a label-only window — zero footer changes needed.
 *
 * Measurement (llama.cpp specifics):
 * - llama.cpp streams 1 token per SSE chunk → counting deltas IS token counting
 * - pi already sends stream_options.include_usage → message.usage.output is exact
 * - decode TPS = output tokens / (first delta → last delta), never t₀ → end
 *   (a cold prefill must not smear the decode rate — the hermes-agent lesson)
 *
 * Gates: provider === "llama.cpp", and only while an agent run is active, so
 * idle cache-warming requests never light the line up.
 *
 * No config, no commands, no emoji. Flexoki to match the footer.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

// ── Constants ──

const PROVIDER = "llama.cpp";
const STATUS_KEY = `usage:${PROVIDER}`;
const WIDGET_KEY = "llama-speed";

/** Blank rows between the ∿ line and the editor border below it. */
const PAD_ROWS_BELOW = 1;
/** Extra leading columns before ∿ (string widgets get a forced 1-col pad from pi). */
const INDENT = 0;

const WAVE = "∿";

const TICK_MS = 200;
const WINDOW_MS = 2500;

// flexoki (see statusline.ts)
const DIM = "#6F6E69";
const GREEN = "#879A39";
const YELLOW = "#D0A215";
const ORANGE = "#DA702C";
const RED = "#D14D41";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// ── ANSI helpers (house style from statusline.ts) ──

function rgb(hex: string): string {
  const red = parseInt(hex.slice(1, 3), 16);
  const green = parseInt(hex.slice(3, 5), 16);
  const blue = parseInt(hex.slice(5, 7), 16);
  return `${red};${green};${blue}`;
}

function fg(hex: string, text: string): string {
  return `\u001B[38;2;${rgb(hex)}m${text}\u001B[0m`;
}

// ── Speed colors ──

function prefillColor(elapsedMs: number): string {
  if (elapsedMs < 1200) {
    return GREEN;
  }
  if (elapsedMs < 3000) {
    return YELLOW;
  }
  if (elapsedMs < 6000) {
    return ORANGE;
  }
  return RED;
}

function tpsColor(tps: number): string {
  if (tps >= 30) {
    return GREEN;
  }
  if (tps >= 15) {
    return YELLOW;
  }
  return ORANGE;
}

// ── Per-call measurement state ──

interface CallState {
  requestAt: number | null;
  firstDeltaAt: number | null;
  lastDeltaAt: number | null;
  /** Delta timestamps inside the sliding window. */
  window: number[];
  /** Total deltas this call (1 delta ≈ 1 token for llama.cpp). */
  count: number;
}

function newCallState(): CallState {
  return {
    count: 0,
    firstDeltaAt: null,
    lastDeltaAt: null,
    requestAt: null,
    window: [],
  };
}

function recordDelta(state: CallState, now: number): void {
  if (state.requestAt === null) {
    return;
  }
  state.firstDeltaAt ??= now;
  state.lastDeltaAt = now;
  state.count += 1;

  const cutoff = now - WINDOW_MS;
  while (state.window.length > 0 && state.window[0] < cutoff) {
    state.window.shift();
  }
  state.window.push(now);
}

/** Instantaneous rate from the sliding window, EWMA-smoothed. */
function liveTps(state: CallState, ewma: { value: number | null }, now: number): number | null {
  const { window } = state;
  if (window.length < 2) {
    return ewma.value;
  }

  const newest = window.at(-1);
  if (newest === undefined) {
    return ewma.value;
  }
  const span = (newest - window[0]) / 1000;
  if (span <= 0) {
    return ewma.value;
  }

  // Include the idle gap since the newest sample so stalls drag the rate down.
  const idle = Math.max(0, (now - newest) / 1000);
  const adjusted = window.length / (span + idle);

  ewma.value = ewma.value === null ? adjusted : 0.3 * adjusted + 0.7 * ewma.value;
  return ewma.value;
}

/**
 * Exact decode rate for a finished call. Prefers provider-reported output
 * tokens, falls back to the delta count (aborted streams carry no usage).
 */
function finalTps(state: CallState, outputTokens: number | undefined): number | null {
  const { firstDeltaAt, lastDeltaAt } = state;
  if (firstDeltaAt === null || lastDeltaAt === null) {
    return null;
  }

  const tokens = outputTokens ?? state.count;
  if (tokens <= 0) {
    return null;
  }

  const spanMs = Math.max(lastDeltaAt - firstDeltaAt, 150);
  return tokens / (spanMs / 1000);
}

// ── Line rendering ──

function formatTps(tps: number): string {
  return tps.toFixed(1).padStart(4);
}

function formatLatency(ms: number): string {
  return ms < 1000 ? `${String(Math.round(ms)).padStart(3)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function renderLine(state: CallState, ewma: { value: number | null }, now: number): string | null {
  const { requestAt, firstDeltaAt } = state;
  if (requestAt === null) {
    return null;
  }

  // Prefill: no tokens yet — count up. The color ramp is the severity story.
  if (firstDeltaAt === null) {
    const elapsedMs = now - requestAt;
    const color = prefillColor(elapsedMs);
    const value = (elapsedMs / 1000).toFixed(1).padStart(3);
    return `${fg(color, WAVE)} ${fg(color, `${value}s`)}${fg(color, "…")}`;
  }

  // Streaming: frozen TTFT (left, colored by wait) + live decode rate (right).
  const tps = liveTps(state, ewma, now);
  if (tps === null) {
    return null;
  }
  const ttftMs = firstDeltaAt - requestAt;
  return (
    `${fg(prefillColor(ttftMs), WAVE)} ${fg(prefillColor(ttftMs), formatLatency(ttftMs))}` +
    ` ${fg(DIM, "·")} ${fg(tpsColor(tps), formatTps(tps))} ${fg(DIM, "t/s")}`
  );
}

// ── Extension ──

export default function statuslineLlama(pi: ExtensionAPI) {
  let state = newCallState();
  const ewma = { value: null as number | null };

  let agentActive = false;
  let ticker: ReturnType<typeof setInterval> | undefined;
  let spinnerSwapped = false;
  let frameIndex = 0;

  function clearTicker(): void {
    if (ticker !== undefined) {
      clearInterval(ticker);
      ticker = undefined;
    }
  }

  function hideWidget(ctx: ExtensionContext): void {
    ctx.ui.setWidget(WIDGET_KEY, undefined);
  }

  function restoreSpinner(ctx: ExtensionContext): void {
    if (spinnerSwapped) {
      spinnerSwapped = false;
      ctx.ui.setWorkingIndicator(undefined);
    }
  }

  function cleanup(ctx: ExtensionContext): void {
    clearTicker();
    hideWidget(ctx);
    restoreSpinner(ctx);
  }

  function isLlama(ctx: { model?: { provider?: string } }): boolean {
    return ctx.model?.provider === PROVIDER;
  }

  function tick(ctx: ExtensionContext): void {
    const line = renderLine(state, ewma, Date.now());
    if (line === null) {
      return;
    }
    const padded = " ".repeat(INDENT) + line;

    if (ctx.mode === "tui") {
      // Factory form: Text collapses empty strings to zero-height rows, so a
      // real blank row has to come from our own render().
      const gap = PAD_ROWS_BELOW;
      ctx.ui.setWidget(WIDGET_KEY, (_tui, _theme) => ({
        invalidate() {},
        render(width: number): string[] {
          const rows = [padded];
          for (let row = 0; row < gap; row++) {
            rows.push(" ".repeat(width));
          }
          return rows;
        },
      }));
      return;
    }

    // String form (RPC mode): no padding possible, pi filters blank rows.
    ctx.ui.setWidget(WIDGET_KEY, [padded]);
  }

  function startCall(ctx: ExtensionContext): void {
    state = newCallState();
    state.requestAt = Date.now();
    ewma.value = null;
    frameIndex = 0;

    if (ctx.mode === "tui") {
      spinnerSwapped = true;
      // Prefill: pi's normal animation (a static frame reads as hung).
      // If the per-token rekey in message_update ever misbehaves, remove both.
      ctx.ui.setWorkingIndicator({ frames: SPINNER_FRAMES, intervalMs: 80 });
    }

    clearTicker();
    ticker = setInterval(() => {
      tick(ctx);
    }, TICK_MS);
    tick(ctx);
  }

  pi.on("before_agent_start", () => {
    agentActive = true;
  });

  pi.on("agent_settled", (_event, ctx) => {
    agentActive = false;
    cleanup(ctx);
  });

  pi.on("before_provider_request", (_event, ctx) => {
    if (!agentActive || !isLlama(ctx) || !ctx.hasUI) {
      return;
    }
    startCall(ctx);
  });

  pi.on("message_update", (event, ctx) => {
    if (!agentActive || !isLlama(ctx) || !ctx.hasUI) {
      return;
    }

    const type = (event.assistantMessageEvent as { type?: string } | undefined)?.type;
    if (type !== "text_delta" && type !== "thinking_delta" && type !== "toolcall_delta") {
      return;
    }

    const now = Date.now();
    recordDelta(state, now);

    if (spinnerSwapped && ctx.mode === "tui") {
      // Decoding: one frame per token — the blink rate is the speedometer.
      frameIndex = (state.count - 1) % SPINNER_FRAMES.length;
      ctx.ui.setWorkingIndicator({ frames: [SPINNER_FRAMES[frameIndex]], intervalMs: 0 });
    }
  });

  pi.on("message_end", (event, ctx) => {
    if (!isLlama(ctx) || !ctx.hasUI) {
      return;
    }
    if (event.message.role !== "assistant") {
      return;
    }

    const { usage } = event.message as { usage?: { output?: number } };
    const tps = finalTps(state, usage?.output);
    cleanup(ctx);

    if (tps !== null) {
      ctx.ui.setStatus(
        STATUS_KEY,
        JSON.stringify({ windows: [{ label: `${WAVE} ${formatTps(tps)} t/s` }] }),
      );
    }
  });

  pi.on("model_select", (event, ctx) => {
    if (event.model.provider !== PROVIDER) {
      cleanup(ctx);
      ctx.ui.setStatus(STATUS_KEY, undefined);
    }
  });

  pi.on("session_shutdown", (_event, ctx) => {
    agentActive = false;
    cleanup(ctx);
  });
}
