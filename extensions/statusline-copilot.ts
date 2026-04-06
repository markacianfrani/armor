/**
 * GitHub Copilot usage provider for the statusline.
 *
 * Implements the usage provider contract — see statusline.ts.
 * Polls the Copilot internal API when the active model is github-copilot.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const PROVIDER = "github-copilot";
const STATUS_KEY = `usage:${PROVIDER}`;
const AUTH_PATH = join(homedir(), ".pi", "agent", "auth.json");

/** Read the GitHub OAuth token (refresh) from pi's auth storage. */
async function getGitHubToken(): Promise<string | null> {
  try {
    const raw = await readFile(AUTH_PATH, "utf-8");
    const auth = JSON.parse(raw) as Record<string, { refresh?: string }>;
    return auth[PROVIDER]?.refresh ?? null;
  } catch {
    return null;
  }
}

async function buildRequest(): Promise<{ url: string; init: RequestInit } | null> {
  const token = await getGitHubToken();
  if (!token) {
    return null;
  }

  return {
    url: "https://api.github.com/copilot_internal/user",
    init: {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/json",
        "User-Agent": "GitHubCopilotChat/0.35.0",
        "Editor-Version": "vscode/1.107.0",
        "Editor-Plugin-Version": "copilot-chat/0.35.0",
        "Copilot-Integration-Id": "vscode-chat",
        "X-GitHub-Api-Version": "2025-04-01",
      },
      signal: AbortSignal.timeout(10_000),
    },
  };
}

function normalize(json: unknown): UsageWindow[] | null {
  if (!json || typeof json !== "object") {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped vendor API response
  const obj = json as Record<string, any>;
  const snapshots = obj["quota_snapshots"] ?? obj["quotaSnapshots"];
  const resetDate = (obj["quota_reset_date_utc"] ?? obj["quota_reset_date"]) as string | undefined;

  if (!snapshots || typeof snapshots !== "object") {
    return null;
  }

  const resetAt = resetDate ? Math.floor(new Date(resetDate).getTime() / 1000) : undefined;

  // only care about premium_interactions — chat/completions are often unlimited
  const premium = snapshots["premium_interactions"];
  if (!premium || typeof premium["percent_remaining"] !== "number") {
    return null;
  }

  return [
    {
      usedPercent: 100 - premium["percent_remaining"],
      resetAt,
    },
  ];
}

interface UsageWindow {
  usedPercent: number;
  resetAt?: number;
}

const POLL_MS = 600_000;
const ERROR_BACKOFF_MS = 120_000;

type PollState = "idle" | "loading" | "ready" | "error";

class UsagePoller {
  private state: PollState = "idle";
  private fetchedAt = 0;
  private lastErrorAt = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private inFlight: Promise<void> | undefined;
  private generation = 0;

  constructor(private publish: (json: string | undefined) => void) {}

  activate(): void {
    this.generation++;
    this.state = "idle";
    this.stopTimer();
    this.poll();
    this.timer = setInterval(() => this.poll(), POLL_MS);
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

  private async poll(): Promise<void> {
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
    this.inFlight = this.doFetch(gen).finally(() => {
      this.inFlight = undefined;
    });
  }

  private async doFetch(gen: number): Promise<void> {
    try {
      const req = await buildRequest();
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
    poller = new UsagePoller((json) => {
      ctx.ui.setStatus(STATUS_KEY, json);
    });

    if (ctx.model?.provider === PROVIDER) {
      poller.activate();
    }
  });

  pi.on("model_select", (event, _ctx) => {
    if (!poller) {
      return;
    }
    if (event.model.provider === PROVIDER) {
      poller.activate();
    } else {
      poller.deactivate();
    }
  });

  pi.on("session_shutdown", () => {
    poller?.dispose();
  });
}
