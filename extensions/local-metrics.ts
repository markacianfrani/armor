/**
 * Local model metrics.
 *
 *   ▎ TTFT   6.14s · ▇  82% ·  58.7 tok/s  ▇▆▇█▇▇▆█
 *
 * One line above the editor while a locally-served model is selected.
 *
 * Activates for any model served from this machine or the LAN, so standing up
 * a new local server needs no change here: omlx on 127.0.0.1, mustafar on
 * mustafar.lan, ollama, LM Studio and llama.cpp all match on baseUrl alone.
 * Cloud models get no panel — these numbers only mean something when the
 * hardware doing the work is yours.
 *
 * ── What is shown, and why only this ──
 *
 * TTFT     Local clock, request sent → first real token. This is the delay you
 *          actually wait through, so it is measured where you wait.
 * cache    Share of the prompt the server had cached, as a block-eighth gauge
 *          plus the number. A slow turn is nearly always a cache miss rather
 *          than slow hardware, and the gauge drops to ▁ before you read a
 *          digit.
 * decode   Output tokens ÷ (last delta − first delta). Dividing by the whole
 *          turn instead folds prefill into the rate and reports a machine far
 *          slower than it is.
 * spark    Decode rate for the last 8 turns, scaled to the fastest turn seen
 *          for this model. Thermal throttle and CPU contention show up as a
 *          falling shape; a single turn cannot show either.
 *
 * A prefill rate is deliberately absent. Computing it client-side means
 * tokens ÷ TTFT, and TTFT includes model load and queueing — a cold start
 * reports a prefill rate near zero that says nothing about the machine. The
 * honest figure needs the server's `prompt_eval_duration`, which pi's Usage
 * type does not carry, so it cannot be reached from an extension.
 *
 * A `~` marks an estimated decode rate. Two things cause it: while streaming,
 * tokens are counted as stream chunks, and speculative decoding or MTP pack
 * several tokens into one chunk; and a server that reports no usage leaves
 * chunk count as the only source after the fact. If it never clears, the
 * provider is missing `compat.supportsUsageInStreaming`.
 */

import type { Api, Model } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type AnyModel = Model<Api>;

const WIDGET_KEY = "local-metrics";

/** Refresh cadence while a request is in flight. */
const TICK_MS = 250;

/** Turns kept for the trend sparkline. */
const HISTORY = 8;

const PLACEHOLDER = "—";

/** Block eighths, low to full. Used for both the cache gauge and the spark. */
const BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

/** Distinct from ▁ (a real 0%) so "unknown" never reads as "empty". */
const UNKNOWN_BLOCK = "░";

// ── Colors (flexoki, matching statusline.ts) ──

function rgb(hex: string): string {
  const red = parseInt(hex.slice(1, 3), 16);
  const green = parseInt(hex.slice(3, 5), 16);
  const blue = parseInt(hex.slice(5, 7), 16);
  return `${red};${green};${blue}`;
}

function fg(hex: string, text: string): string {
  return `\u001B[38;2;${rgb(hex)}m${text}\u001B[0m`;
}

// base-600
const DIM = "#6F6E69";
// base-500
const MUTED = "#878580";
// cyan-400
const VALUE = "#3AA99F";

// ── Local detection ──

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) {
    return false;
  }

  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return false;
    }
    const value = Number(part);
    if (value > 255) {
      return false;
    }
    octets.push(value);
  }

  const [first, second] = octets;
  if (first === 10 || first === 127) {
    return true;
  }
  if (first === 192 && second === 168) {
    return true;
  }
  if (first === 172 && second >= 16 && second <= 31) {
    return true;
  }
  // Link-local — a second machine on a Thunderbolt bridge lands here.
  return first === 169 && second === 254;
}

function isLocalModel(model: AnyModel | undefined): boolean {
  if (!model) {
    return false;
  }

  let hostname: string;
  try {
    hostname = new URL(model.baseUrl).hostname.toLowerCase();
  } catch {
    return false;
  }

  // URL.hostname keeps the brackets around an IPv6 literal.
  const host =
    hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;

  if (host === "localhost" || host === "::1") {
    return true;
  }
  if (host.endsWith(".local") || host.endsWith(".lan") || host.endsWith(".localhost")) {
    return true;
  }
  return isPrivateIpv4(host);
}

// ── Formatting ──

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatRate(tokensPerSecond: number, estimated: boolean): string {
  return `${estimated ? "~" : ""}${tokensPerSecond.toFixed(1)}`;
}

function block(ratio: number): string {
  // BLOCKS[i] draws (i + 1)/8 of a cell, so round to the nearest eighth and
  // step back one. Scaling across BLOCKS.length - 1 instead reads half a
  // cell high for a half-full value.
  const eighths = Math.round(Math.min(1, Math.max(0, ratio)) * BLOCKS.length);
  return BLOCKS[Math.max(0, eighths - 1)];
}

function sparkline(rates: readonly number[]): string {
  if (rates.length === 0) {
    return "";
  }
  // Scaled to the session's best turn, so the shape reads as "share of the
  // fastest this machine has managed" rather than an absolute rate.
  const fastest = Math.max(...rates);
  if (fastest <= 0) {
    return "";
  }
  return rates.map((rate) => block(rate / fastest)).join("");
}

// Field widths keep the sparkline from sliding as numbers change width.
const TTFT_WIDTH = 8;
const PERCENT_WIDTH = 4;
const RATE_WIDTH = 5;

// ── Metrics ──

interface SettledTurn {
  ttftMs: number;
  cacheRatio: number | undefined;
  decodeTps: number | undefined;
  estimated: boolean;
}

interface TurnUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

type Render = (lines?: string[]) => void;

class LocalMetrics {
  private readonly render: Render;

  private active = false;
  private modelKey: string | undefined;

  private requestStartMs: number | undefined;
  private firstDeltaMs: number | undefined;
  private lastDeltaMs: number | undefined;
  private chunkCount = 0;
  private settled: SettledTurn | undefined;
  private history: number[] = [];
  private ticker: ReturnType<typeof setInterval> | undefined;

  constructor(render: Render) {
    this.render = render;
  }

  setModel(model: AnyModel | undefined): void {
    const nextActive = isLocalModel(model);
    const nextKey = model === undefined ? undefined : `${model.provider}/${model.id}`;
    // Keyed on the model, not just local-vs-cloud: a dense build and an MoE
    // build differ several-fold in decode rate, and sharing a sparkline scale
    // across them makes the slower one look like a collapse.
    if (nextActive === this.active && nextKey === this.modelKey) {
      return;
    }

    this.active = nextActive;
    this.modelKey = nextKey;
    // Rates from another model would distort this one's sparkline scale.
    this.settled = undefined;
    this.history = [];
    this.resetRequest();
    this.stopTicker();
    this.draw();
  }

  onRequestStart(): void {
    if (!this.active) {
      return;
    }
    this.resetRequest();
    this.requestStartMs = Date.now();
    // The last turn stays in `settled`: an in-flight request takes precedence
    // in line(), and a request that dies before its first token falls back to
    // it rather than blanking the panel.
    this.startTicker();
    this.draw();
  }

  onDelta(text: string): void {
    if (this.requestStartMs === undefined) {
      return;
    }

    if (this.firstDeltaMs === undefined) {
      // oMLX sends keepalive chunks during a long prefill, and a whitespace one
      // gets past pi's empty-content filter. Treating it as the first token
      // would collapse TTFT to nothing and invent a stall in the decode window.
      if (text.trim() === "") {
        return;
      }
      this.firstDeltaMs = Date.now();
    }

    this.lastDeltaMs = Date.now();
    this.chunkCount += 1;
  }

  onMessageEnd(usage: TurnUsage): void {
    this.stopTicker();

    const startMs = this.requestStartMs;
    const firstMs = this.firstDeltaMs;
    const lastMs = this.lastDeltaMs;
    if (startMs === undefined || firstMs === undefined || lastMs === undefined) {
      // Aborted before any token arrived — keep the last good turn on screen.
      this.resetRequest();
      this.draw();
      return;
    }

    // A bare llama.cpp server reports no usage unless asked; chunk count is
    // then the only token signal available.
    const estimated = usage.output <= 0;
    const outputTokens = estimated ? this.chunkCount : usage.output;
    // pi reports `input` as the uncached remainder, so the prompt is the sum.
    const promptTokens = usage.input + usage.cacheRead + usage.cacheWrite;
    const decodeTps = this.decodeRate(outputTokens);

    this.settled = {
      cacheRatio: promptTokens > 0 ? usage.cacheRead / promptTokens : undefined,
      decodeTps,
      estimated,
      ttftMs: firstMs - startMs,
    };
    if (decodeTps !== undefined) {
      this.history = [...this.history, decodeTps].slice(-HISTORY);
    }
    this.resetRequest();
    this.draw();
  }

  stopTicker(): void {
    if (this.ticker === undefined) {
      return;
    }
    clearInterval(this.ticker);
    this.ticker = undefined;
  }

  dispose(): void {
    this.stopTicker();
    this.active = false;
    this.render();
  }

  private resetRequest(): void {
    this.requestStartMs = undefined;
    this.firstDeltaMs = undefined;
    this.lastDeltaMs = undefined;
    this.chunkCount = 0;
  }

  private decodeRate(tokens: number): number | undefined {
    const firstMs = this.firstDeltaMs;
    const lastMs = this.lastDeltaMs;
    if (firstMs === undefined || lastMs === undefined || tokens < 2) {
      return undefined;
    }

    const windowMs = lastMs - firstMs;
    if (windowMs <= 0) {
      return undefined;
    }
    // The first token's cost is TTFT; the decode window holds only the rest.
    return ((tokens - 1) * 1000) / windowMs;
  }

  private startTicker(): void {
    if (this.ticker !== undefined) {
      return;
    }
    this.ticker = setInterval(() => {
      this.draw();
    }, TICK_MS);
    this.ticker.unref();
  }

  /** TTFT, cache gauge and decode rate for the current state. */
  private fields(): { ttft: string; cache: string; percent: string; rate: string } {
    const startMs = this.requestStartMs;

    if (startMs !== undefined) {
      const firstMs = this.firstDeltaMs;
      if (firstMs === undefined) {
        // Prefill on a long context runs for seconds — show it counting up.
        return {
          cache: UNKNOWN_BLOCK,
          percent: PLACEHOLDER,
          rate: PLACEHOLDER,
          ttft: `⋯ ${formatDuration(Date.now() - startMs)}`,
        };
      }

      const live = this.decodeRate(this.chunkCount);
      return {
        // Usage only arrives with the final chunk, so the share is not yet known.
        cache: UNKNOWN_BLOCK,
        percent: PLACEHOLDER,
        rate: live === undefined ? PLACEHOLDER : formatRate(live, true),
        ttft: formatDuration(firstMs - startMs),
      };
    }

    const { settled } = this;
    if (settled === undefined) {
      return { cache: UNKNOWN_BLOCK, percent: PLACEHOLDER, rate: PLACEHOLDER, ttft: PLACEHOLDER };
    }

    return {
      cache: settled.cacheRatio === undefined ? UNKNOWN_BLOCK : block(settled.cacheRatio),
      percent:
        settled.cacheRatio === undefined ? PLACEHOLDER : `${Math.round(settled.cacheRatio * 100)}%`,
      rate:
        settled.decodeTps === undefined
          ? PLACEHOLDER
          : formatRate(settled.decodeTps, settled.estimated),
      ttft: formatDuration(settled.ttftMs),
    };
  }

  private line(): string {
    const { ttft, cache, percent, rate } = this.fields();
    const segments = [
      `${fg(DIM, "▎")} ${fg(DIM, "TTFT")} ${fg(VALUE, ttft.padStart(TTFT_WIDTH))}`,
      `${fg(VALUE, cache)} ${fg(VALUE, percent.padStart(PERCENT_WIDTH))}`,
      `${fg(VALUE, rate.padStart(RATE_WIDTH))} ${fg(DIM, "tok/s")}`,
    ];

    const line = segments.join(fg(DIM, " · "));
    const spark = sparkline(this.history);
    return spark === "" ? line : `${line}  ${fg(MUTED, spark)}`;
  }

  private draw(): void {
    if (!this.active) {
      this.render();
      return;
    }
    this.render([this.line()]);
  }
}

// ── Extension entry ──

export default function localMetrics(pi: ExtensionAPI) {
  let metrics: LocalMetrics | undefined;

  pi.on("session_start", (_event, ctx) => {
    metrics = new LocalMetrics((lines) => {
      ctx.ui.setWidget(WIDGET_KEY, lines, { placement: "aboveEditor" });
    });
    metrics.setModel(ctx.model);
  });

  pi.on("model_select", (event, _ctx) => {
    metrics?.setModel(event.model);
  });

  // Fires as the payload is handed to the provider — the only anchor that sees
  // prompt processing. Returning nothing leaves the payload untouched.
  pi.on("before_provider_request", (_event, _ctx) => {
    metrics?.onRequestStart();
  });

  pi.on("message_update", (event, _ctx) => {
    const streamEvent = event.assistantMessageEvent;
    if (
      streamEvent.type === "text_delta" ||
      streamEvent.type === "thinking_delta" ||
      streamEvent.type === "toolcall_delta"
    ) {
      metrics?.onDelta(streamEvent.delta);
    }
  });

  pi.on("message_end", (event, _ctx) => {
    const { message } = event;
    // A user message_end fires first each turn and carries no usage.
    if (message.role !== "assistant") {
      return;
    }
    const { usage } = message;
    metrics?.onMessageEnd({
      cacheRead: usage.cacheRead,
      cacheWrite: usage.cacheWrite,
      input: usage.input,
      output: usage.output,
    });
  });

  // Backstop for a stream that ends without a message_end (abort, error).
  pi.on("agent_end", () => {
    metrics?.stopTicker();
  });

  pi.on("session_shutdown", () => {
    metrics?.dispose();
    metrics = undefined;
  });
}
