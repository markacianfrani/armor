/**
 * OpenRouter usage provider for the statusline.
 *
 * Implements the usage provider contract — see statusline.ts.
 * Polls the OpenRouter key API when the active model is openrouter.
 *
 * Endpoint: GET https://openrouter.ai/api/v1/key
 * Response: { data: { budgets, effective_budget, limit, usage_monthly, ... } }
 *
 * Window published: the user's member budget (scope `workspace_default_member`),
 * falling back to `effective_budget` — the layer enforcement blocks on first —
 * when no member-scoped budget exists. Rendered as a percent bar with a
 * reset timestamp, like the Claude provider's windows.
 *
 * Keys with no enforced budget fall back to a plain label of the current
 * month's spend.
 */

import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ModelRegistry } from "@earendil-works/pi-coding-agent";

type AnyModel = Model<Api>;

const PROVIDER = "openrouter";
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
    url: "https://openrouter.ai/api/v1/key",
  };
}

// ── Response normalization ──

interface UsageWindow {
  usedPercent?: number;
  resetAt?: number;
  label?: string;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Accepts ISO 8601 strings, unix seconds, or unix milliseconds. */
function asEpochSeconds(value: unknown): number | undefined {
  const str = asString(value);
  if (str !== undefined) {
    const parsed = Date.parse(str);
    return Number.isNaN(parsed) ? undefined : Math.floor(parsed / 1000);
  }
  const numeric = asNumber(value);
  if (numeric === undefined || numeric <= 0) {
    return undefined;
  }
  return numeric > 1e11 ? Math.floor(numeric / 1000) : Math.floor(numeric);
}

/** A budget layer (guardrail / workspace / key limit) enforced on this key. */
interface RawBudget {
  limit_usd?: unknown;
  remaining_usd?: unknown;
  resets_at?: unknown;
  scope?: unknown;
}

function budgetWindow(raw: RawBudget): UsageWindow | null {
  const limit = asNumber(raw.limit_usd);
  const remaining = asNumber(raw.remaining_usd);
  if (limit === undefined || limit <= 0 || remaining === undefined) {
    return null;
  }
  const usedPercent = Math.min(100, Math.max(0, ((limit - remaining) / limit) * 100));
  return { resetAt: asEpochSeconds(raw.resets_at), usedPercent };
}

function normalize(json: unknown): UsageWindow[] | null {
  if (!isRecord(json)) {
    return null;
  }

  const key = json["data"];
  if (!isRecord(key)) {
    return null;
  }

  // The user's member budget; effective_budget (the layer enforcement
  // blocks on first) is the fallback when no member-scoped budget exists.
  const budgets = key["budgets"];
  const raw = Array.isArray(budgets)
    ? budgets.find((b): b is RawBudget => isRecord(b) && b["scope"] === "workspace_default_member")
    : undefined;
  const window = budgetWindow(raw ?? (isRecord(key["effective_budget"]) ? key["effective_budget"] : {}));
  if (window) {
    return [window];
  }

  // No enforced budget (pay-as-you-go) — plain label of this month's spend.
  const monthly = asNumber(key["usage_monthly"]);
  if (monthly !== undefined) {
    return [{ label: `$${monthly.toFixed(2)}` }];
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
  private readonly registry: ModelRegistry;
  private readonly publish: (json?: string) => void;

  constructor(registry: ModelRegistry, publish: (json?: string) => void) {
    this.registry = registry;
    this.publish = publish;
  }

  activate(model: AnyModel): void {
    this.generation++;
    this.state = "idle";
    this.stopTimer();
    void this.poll(model);
    this.timer = setInterval(() => void this.poll(model), POLL_MS);
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
    const run = this.doFetch(model, gen);
    this.inFlight = run;
    try {
      await run;
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
        this.publish();
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

export default function statuslineOpenrouter(pi: ExtensionAPI) {
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
