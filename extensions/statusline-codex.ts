/**
 * Codex (OpenAI) usage provider for the statusline.
 *
 * Implements the usage provider contract — see statusline.ts.
 * Polls the ChatGPT usage API when the active model is openai-codex.
 */

import type { ExtensionAPI, ModelRegistry } from "@mariozechner/pi-coding-agent";
import type { Api, Model } from "@mariozechner/pi-ai";

type AnyModel = Model<Api>;

const PROVIDER = "openai-codex";
const STATUS_KEY = `usage:${PROVIDER}`;

/** Build the request for this provider's usage endpoint. Returns null if auth is missing. */
async function buildRequest(
  model: AnyModel,
  registry: ModelRegistry,
): Promise<{ url: string; init: RequestInit } | null> {
  const auth = await registry.getApiKeyAndHeaders(model);
  if (!auth.ok || !auth.apiKey) {
    return null;
  }

  const authClaim = jwtClaim(auth.apiKey, "https://api.openai.com/auth") as
    | { chatgpt_account_id?: string }
    | undefined;
  const accountId = authClaim?.chatgpt_account_id;
  if (!accountId) {
    return null;
  }

  return {
    url: "https://chatgpt.com/backend-api/wham/usage",
    init: {
      headers: {
        Authorization: `Bearer ${auth.apiKey}`,
        "ChatGPT-Account-Id": accountId,
        Accept: "application/json",
        ...auth.headers,
      },
      signal: AbortSignal.timeout(10_000),
    },
  };
}

/** Normalize this provider's response into the common UsageData shape. */
function normalize(json: unknown): UsageWindow[] | null {
  if (!json || typeof json !== "object") {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped vendor API response
  const obj = json as Record<string, any>;
  const rl = obj["rate_limit"] ?? obj["rateLimit"] ?? obj;
  const windows: UsageWindow[] = [];

  const primary = rl["primary_window"] ?? rl["primaryWindow"];
  if (primary && typeof primary["used_percent"] === "number") {
    windows.push({ usedPercent: primary["used_percent"], resetAt: primary["reset_at"] });
  }

  const secondary = rl["secondary_window"] ?? rl["secondaryWindow"];
  if (secondary && typeof secondary["used_percent"] === "number") {
    windows.push({ usedPercent: secondary["used_percent"], resetAt: secondary["reset_at"] });
  }

  return windows.length > 0 ? windows : null;
}

interface UsageWindow {
  usedPercent: number;
  resetAt?: number;
}

function jwtClaim(token: string, claim: string): unknown {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return undefined;
    }
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(payload, "base64").toString("utf-8"))[claim];
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
