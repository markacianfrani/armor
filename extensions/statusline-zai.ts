/**
 * z.ai usage provider for the statusline.
 *
 * Implements the usage provider contract — see statusline.ts.
 * Polls the z.ai quota API when the active model is zai.
 *
 * Endpoint: GET https://api.z.ai/api/monitor/usage/quota/limit
 * Response: { code, success, data: { limits: [...], planName } }
 *
 * Only the TOKENS_LIMIT window is shown (e.g. 5-hour token window).
 * TIME_LIMIT resets every ~1 minute so polling it is pointless.
 */

import type { ExtensionAPI, ModelRegistry } from "@mariozechner/pi-coding-agent";
import type { Api, Model } from "@mariozechner/pi-ai";

type AnyModel = Model<Api>;

const PROVIDER = "zai";
const STATUS_KEY = `usage:${PROVIDER}`;

// ── Request ──

async function buildRequest(
  model: AnyModel,
  registry: ModelRegistry,
): Promise<{ url: string; init: RequestInit } | null> {
  const auth = await registry.getApiKeyAndHeaders(model);
  if (!auth.ok || !auth.apiKey) {
    return null;
  }

  return {
    url: "https://api.z.ai/api/monitor/usage/quota/limit",
    init: {
      headers: {
        Authorization: `Bearer ${auth.apiKey}`,
        Accept: "application/json",
        ...auth.headers,
      },
      signal: AbortSignal.timeout(10_000),
    },
  };
}

// ── Response normalization ──

interface UsageWindow {
  usedPercent: number;
  resetAt?: number;
}

function normalize(json: unknown): UsageWindow[] | null {
  if (!json || typeof json !== "object") {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped vendor API response
  const obj = json as Record<string, any>;
  if (obj["code"] !== 200 || !obj["success"]) {
    return null;
  }

  const data = obj["data"];
  if (!data || !Array.isArray(data["limits"])) {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped vendor API limits array
  const limits = data["limits"] as Record<string, any>[];

  for (const limit of limits) {
    if (limit["type"] !== "TOKENS_LIMIT") {
      continue;
    }
    const window = parseLimit(limit);
    if (window) {
      return [window];
    }
  }

  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped vendor API limit entry
function parseLimit(limit: Record<string, any>): UsageWindow | null {
  const pct = computeUsedPercent(limit);
  if (pct === null) {
    return null;
  }

  const resetMs = limit["nextResetTime"];
  return {
    usedPercent: pct,
    ...(resetMs !== null && typeof resetMs === "number"
      ? { resetAt: Math.floor(resetMs / 1000) }
      : {}),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped vendor API limit entry
function computeUsedPercent(limit: Record<string, any>): number | null {
  // Prefer computed from usage/remaining for accuracy, fall back to percentage field.
  const usage = limit["usage"];
  if (typeof usage === "number" && usage > 0) {
    let used: number | undefined;
    if (typeof limit["remaining"] === "number") {
      const fromRemaining = usage - limit["remaining"];
      used =
        typeof limit["currentValue"] === "number"
          ? Math.max(fromRemaining, limit["currentValue"])
          : fromRemaining;
    } else if (typeof limit["currentValue"] === "number") {
      used = limit["currentValue"];
    }
    if (used !== undefined) {
      return Math.min(100, Math.max(0, (Math.max(0, used) / usage) * 100));
    }
  }

  if (typeof limit["percentage"] === "number") {
    return limit["percentage"];
  }

  return null;
}

// ── Poller (same pattern as codex/copilot) ──

const POLL_MS = 30_000;
const ERROR_BACKOFF_MS = 120_000;

type PollState = "idle" | "loading" | "ready" | "error";

class UsagePoller {
  private state: PollState = "idle";
  private fetchedAt = 0;
  private lastErrorAt = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private inFlight: Promise<void> | undefined;
  private generation = 0;

  constructor(
    private registry: ModelRegistry,
    private publish: (json: string | undefined) => void,
  ) {}

  activate(model: AnyModel): void {
    this.generation++;
    this.state = "idle";
    this.stopTimer();
    this.poll(model);
    this.timer = setInterval(() => this.poll(model), POLL_MS);
  }

  deactivate(): void {
    this.generation++;
    this.state = "idle";
    this.stopTimer();
    this.publish(undefined);
  }

  dispose(): void {
    this.deactivate();
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async poll(model: AnyModel): Promise<void> {
    if (this.inFlight) {
      return;
    }
    const now = Date.now();
    if (this.state === "error" && now - this.lastErrorAt < ERROR_BACKOFF_MS) {
      return;
    }
    if (this.state === "ready" && now - this.fetchedAt < POLL_MS) {
      return;
    }

    const gen = this.generation;
    this.state = "loading";
    this.inFlight = this.doFetch(model, gen).finally(() => {
      this.inFlight = undefined;
    });
  }

  private async doFetch(model: AnyModel, gen: number): Promise<void> {
    try {
      const req = await buildRequest(model, this.registry);
      if (gen !== this.generation) {
        return;
      }
      if (!req) {
        return this.fail();
      }

      const res = await fetch(req.url, req.init);
      if (gen !== this.generation) {
        return;
      }
      if (!res.ok) {
        return this.fail();
      }

      const json = await res.json();
      if (gen !== this.generation) {
        return;
      }

      const windows = normalize(json);
      if (windows) {
        this.state = "ready";
        this.fetchedAt = Date.now();
        this.publish(JSON.stringify({ windows }));
      } else {
        this.fail();
      }
    } catch {
      if (gen !== this.generation) {
        return;
      }
      this.fail();
    }
  }

  private fail(): void {
    this.state = "error";
    this.lastErrorAt = Date.now();
  }
}

// ── Extension entry ──

export default function (pi: ExtensionAPI) {
  let poller: UsagePoller | undefined;

  pi.on("session_start", (_event, ctx) => {
    poller = new UsagePoller(ctx.modelRegistry, (json) => {
      ctx.ui.setStatus(STATUS_KEY, json);
    });

    if (ctx.model?.provider === PROVIDER) {
      poller.activate(ctx.model);
    }
  });

  pi.on("model_select", (event, _ctx) => {
    if (!poller) {
      return;
    }
    if (event.model.provider === PROVIDER) {
      poller.activate(event.model);
    } else {
      poller.deactivate();
    }
  });

  pi.on("session_shutdown", () => {
    poller?.dispose();
  });
}
