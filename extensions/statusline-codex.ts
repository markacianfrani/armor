/**
 * Codex (OpenAI) usage provider for the statusline.
 *
 * Implements the usage provider contract — see statusline.ts.
 * Polls the ChatGPT usage API when the active model is openai-codex.
 */

import type { Api, Model } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ModelRegistry } from "@mariozechner/pi-coding-agent";

type AnyModel = Model<Api>;

const PROVIDER = "openai-codex";
const STATUS_KEY = `usage:${PROVIDER}`;

/** Build the request for this provider's usage endpoint. Returns null if auth is missing. */
async function buildRequest(
  model: AnyModel,
  registry: ModelRegistry,
): Promise<{ url: string; init: RequestInit } | null> {
  const auth = await registry.getApiKeyAndHeaders(model);
  if (!auth.ok || auth.apiKey === undefined || auth.apiKey === "") {
    return null;
  }

  const authClaim = jwtClaim(auth.apiKey, "https://api.openai.com/auth");
  const accountId =
    isObject(authClaim) && typeof authClaim["chatgpt_account_id"] === "string"
      ? authClaim["chatgpt_account_id"]
      : undefined;
  if (accountId === undefined || accountId === "") {
    return null;
  }

  return {
    init: {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${auth.apiKey}`,
        "ChatGPT-Account-Id": accountId,
        ...auth.headers,
      },
      signal: AbortSignal.timeout(10_000),
    },
    url: "https://chatgpt.com/backend-api/wham/usage",
  };
}

interface UsageWindow {
  usedPercent: number;
  resetAt?: number;
}

/** A single window from the usage API, in either snake_case or camelCase form. */
interface RawUsageWindow {
  used_percent?: number;
  usedPercent?: number;
  reset_at?: number;
  resetAt?: number;
}

/** The usage API response shape, tolerant of snake_case/camelCase and a nested rate_limit. */
interface RawUsageResponse {
  rate_limit?: RawRateLimit;
  rateLimit?: RawRateLimit;
  primary_window?: RawUsageWindow;
  primaryWindow?: RawUsageWindow;
  secondary_window?: RawUsageWindow;
  secondaryWindow?: RawUsageWindow;
}

interface RawRateLimit {
  primary_window?: RawUsageWindow;
  primaryWindow?: RawUsageWindow;
  secondary_window?: RawUsageWindow;
  secondaryWindow?: RawUsageWindow;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Pull a window's used percent and reset time, tolerating either naming convention. */
function toUsageWindow(raw: RawUsageWindow | undefined): UsageWindow | null {
  if (!raw) {
    return null;
  }
  const usedPercent = raw.used_percent ?? raw.usedPercent;
  if (typeof usedPercent !== "number") {
    return null;
  }
  return { resetAt: raw.reset_at ?? raw.resetAt, usedPercent };
}

/** Normalize this provider's response into the common UsageData shape. */
function normalize(json: unknown): UsageWindow[] | null {
  if (!isObject(json)) {
    return null;
  }

  const obj = json as RawUsageResponse;
  const rl: RawRateLimit = obj.rate_limit ?? obj.rateLimit ?? obj;
  const windows: UsageWindow[] = [];

  const primary = toUsageWindow(rl.primary_window ?? rl.primaryWindow);
  if (primary) {
    windows.push(primary);
  }

  const secondary = toUsageWindow(rl.secondary_window ?? rl.secondaryWindow);
  if (secondary) {
    windows.push(secondary);
  }

  return windows.length > 0 ? windows : null;
}

function jwtClaim(token: string, claim: string): unknown {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return undefined;
    }
    const payload = parts[1].replaceAll("-", "+").replaceAll("_", "/");
    const decoded: unknown = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    return isObject(decoded) ? decoded[claim] : undefined;
  } catch {
    return undefined;
  }
}

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

  private poll(model: AnyModel): Promise<void> {
    if (this.inFlight) {
      return Promise.resolve();
    }
    const now = Date.now();
    if (this.state === "error" && now - this.lastErrorAt < ERROR_BACKOFF_MS) {
      return Promise.resolve();
    }
    if (this.state === "ready" && now - this.fetchedAt < POLL_MS) {
      return Promise.resolve();
    }

    const gen = this.generation;
    this.state = "loading";
    const inFlight = this.runFetch(model, gen);
    this.inFlight = inFlight;
    return inFlight;
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

      const json: unknown = await res.json();
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

export default function statuslineCodex(pi: ExtensionAPI) {
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
