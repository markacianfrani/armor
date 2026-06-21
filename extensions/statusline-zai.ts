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

import type { Api, Model } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ModelRegistry } from "@mariozechner/pi-coding-agent";

type AnyModel = Model<Api>;

const PROVIDER = "zai";
const STATUS_KEY = `usage:${PROVIDER}`;

// ── Request ──

async function buildRequest(
  model: AnyModel,
  registry: ModelRegistry,
): Promise<{ url: string; init: RequestInit } | null> {
  const auth = await registry.getApiKeyAndHeaders(model);
  if (!auth.ok || auth.apiKey === undefined || auth.apiKey === "") {
    return null;
  }

  return {
    init: {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${auth.apiKey}`,
        ...auth.headers,
      },
      signal: AbortSignal.timeout(10_000),
    },
    url: "https://api.z.ai/api/monitor/usage/quota/limit",
  };
}

// ── Response normalization ──

interface UsageWindow {
  usedPercent: number;
  resetAt?: number;
}

interface QuotaLimit {
  type?: string;
  usage?: number;
  remaining?: number;
  currentValue?: number;
  percentage?: number;
  nextResetTime?: number;
}

interface QuotaResponse {
  code?: number;
  success?: boolean;
  data?: { limits?: QuotaLimit[] };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function asQuotaLimit(value: unknown): QuotaLimit | null {
  if (!isObject(value)) {
    return null;
  }
  return {
    currentValue: asNumber(value["currentValue"]),
    nextResetTime: asNumber(value["nextResetTime"]),
    percentage: asNumber(value["percentage"]),
    remaining: asNumber(value["remaining"]),
    type: typeof value["type"] === "string" ? value["type"] : undefined,
    usage: asNumber(value["usage"]),
  };
}

function parseQuotaResponse(json: unknown): QuotaResponse | null {
  if (!isObject(json)) {
    return null;
  }
  const { data } = json;
  const rawLimits = isObject(data) ? data["limits"] : undefined;
  const limits = Array.isArray(rawLimits)
    ? rawLimits.flatMap((entry) => {
        const limit = asQuotaLimit(entry);
        return limit === null ? [] : [limit];
      })
    : undefined;
  return {
    code: asNumber(json["code"]),
    data: { limits },
    success: json["success"] === true,
  };
}

function normalize(json: unknown): UsageWindow[] | null {
  const parsed = parseQuotaResponse(json);
  if (parsed === null || parsed.code !== 200 || parsed.success !== true) {
    return null;
  }

  const limits = parsed.data?.limits;
  if (limits === undefined) {
    return null;
  }

  for (const limit of limits) {
    if (limit.type === "TOKENS_LIMIT") {
      const window = parseLimit(limit);
      if (window !== null) {
        return [window];
      }
    }
  }

  return null;
}

function parseLimit(limit: QuotaLimit): UsageWindow | null {
  const pct = computeUsedPercent(limit);
  if (pct === null) {
    return null;
  }

  const resetMs = limit.nextResetTime;
  return {
    usedPercent: pct,
    ...(resetMs !== undefined ? { resetAt: Math.floor(resetMs / 1000) } : {}),
  };
}

function computeUsedPercent(limit: QuotaLimit): number | null {
  // Prefer computed from usage/remaining for accuracy, fall back to percentage field.
  const { usage } = limit;
  if (usage !== undefined && usage > 0) {
    let used: number | undefined;
    if (limit.remaining !== undefined) {
      const fromRemaining = usage - limit.remaining;
      used =
        limit.currentValue !== undefined
          ? Math.max(fromRemaining, limit.currentValue)
          : fromRemaining;
    } else if (limit.currentValue !== undefined) {
      used = limit.currentValue;
    }
    if (used !== undefined) {
      return Math.min(100, Math.max(0, (Math.max(0, used) / usage) * 100));
    }
  }

  if (limit.percentage !== undefined) {
    return limit.percentage;
  }

  return null;
}

// ── Poller (same pattern as codex/copilot) ──

const POLL_MS = 30_000;
const ERROR_BACKOFF_MS = 120_000;

type PollState = "idle" | "loading" | "ready" | "error";

class UsagePoller {
  private readonly registry: ModelRegistry;
  private readonly publish: (json?: string) => void;
  private state: PollState = "idle";
  private fetchedAt = 0;
  private lastErrorAt = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private inFlight: Promise<void> | undefined;
  private generation = 0;

  constructor(registry: ModelRegistry, publish: (json?: string) => void) {
    this.registry = registry;
    this.publish = publish;
  }

  activate(model: AnyModel): void {
    this.generation++;
    this.state = "idle";
    this.stopTimer();
    this.poll(model);
    this.timer = setInterval(() => {
      this.poll(model);
    }, POLL_MS);
  }

  deactivate(): void {
    this.generation++;
    this.state = "idle";
    this.stopTimer();
    this.publish();
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

  private poll(model: AnyModel): void {
    if (this.inFlight !== undefined) {
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
    this.inFlight = this.runFetch(model, gen);
  }

  private async runFetch(model: AnyModel, gen: number): Promise<void> {
    try {
      await this.doFetch(model, gen);
    } finally {
      this.inFlight = undefined;
    }
  }

  private async doFetch(model: AnyModel, gen: number): Promise<void> {
    try {
      const req = await buildRequest(model, this.registry);
      if (gen !== this.generation) {
        return;
      }
      if (!req) {
        this.fail();
        return;
      }

      const res = await fetch(req.url, req.init);
      if (gen !== this.generation) {
        return;
      }
      if (!res.ok) {
        this.fail();
        return;
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

export default function statuslineZai(pi: ExtensionAPI) {
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
