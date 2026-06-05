/**
 * OpenRouter usage provider for the statusline.
 *
 * Implements the usage provider contract — see statusline.ts.
 * Polls the OpenRouter key API when the active model is openrouter.
 *
 * Endpoint: GET https://openrouter.ai/api/v1/key
 * Response: { data: { limit, limit_remaining, usage, ... } }
 *
 * Shows the configured credit limit usage for the current API key. Keys with
 * no limit return null limit/limit_remaining and are treated as unlimited, so
 * no usage bar is published.
 */

import type { ExtensionAPI, ModelRegistry } from "@mariozechner/pi-coding-agent";
import type { Api, Model } from "@mariozechner/pi-ai";

type AnyModel = Model<Api>;

const PROVIDER = "openrouter";
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
    url: "https://openrouter.ai/api/v1/key",
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
  usedPercent?: number;
  resetAt?: number;
  label?: string;
}

function normalize(json: unknown): UsageWindow[] | null {
  if (!json || typeof json !== "object") {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped vendor API response
  const obj = json as Record<string, any>;
  const data = obj["data"];
  if (!data || typeof data !== "object") {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped vendor API response
  const key = data as Record<string, any>;
  const limit = key["limit"];
  const remaining = key["limit_remaining"];
  const usage = key["usage"]; // total spent in USD

  const label = typeof usage === "number" && usage > 0 ? `\$${usage.toFixed(2)}` : undefined;

  // If the key has a credit limit, show a percentage bar + dollar label
  if (typeof limit === "number" && limit > 0 && typeof remaining === "number") {
    const usedPercent = ((limit - remaining) / limit) * 100;
    return [{ usedPercent: Math.min(100, Math.max(0, usedPercent)), label }];
  }

  // No limit (pay-as-you-go) — show dollar amount only
  if (label) {
    return [{ label }];
  }

  return null;
}

// ── Poller (same pattern as codex/copilot/zai) ──

const POLL_MS = 60_000;
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
        this.publish(undefined);
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
