/**
 * GitHub Copilot usage provider for the statusline.
 *
 * Implements the usage provider contract — see statusline.ts.
 * Polls the Copilot internal API when the active model is github-copilot.
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const PROVIDER = "github-copilot";
const STATUS_KEY = `usage:${PROVIDER}`;
const AUTH_PATH = join(homedir(), ".pi", "agent", "auth.json");

/** True when value is a non-null object usable as a string-keyed record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Read the GitHub OAuth token (refresh) from pi's auth storage. */
async function getGitHubToken(): Promise<string | null> {
  try {
    const raw = await readFile(AUTH_PATH, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return null;
    }
    const entry = parsed[PROVIDER];
    if (!isRecord(entry)) {
      return null;
    }
    const { refresh } = entry;
    return typeof refresh === "string" ? refresh : null;
  } catch {
    return null;
  }
}

async function buildRequest(): Promise<{ url: string; init: RequestInit } | null> {
  const token = await getGitHubToken();
  if (token === null || token === "") {
    return null;
  }

  return {
    init: {
      headers: {
        Accept: "application/json",
        Authorization: `token ${token}`,
        "Copilot-Integration-Id": "vscode-chat",
        "Editor-Plugin-Version": "copilot-chat/0.35.0",
        "Editor-Version": "vscode/1.107.0",
        "User-Agent": "GitHubCopilotChat/0.35.0",
        "X-GitHub-Api-Version": "2025-04-01",
      },
      signal: AbortSignal.timeout(10_000),
    },
    url: "https://api.github.com/copilot_internal/user",
  };
}

/** Read a string property off an unknown object, or undefined if absent/wrong type. */
function readString(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === "string" ? value : undefined;
}

function normalize(json: unknown): UsageWindow[] | null {
  if (!isRecord(json)) {
    return null;
  }

  const rawSnapshots = json["quota_snapshots"] ?? json["quotaSnapshots"];
  if (!isRecord(rawSnapshots)) {
    return null;
  }

  const resetDate =
    readString(json, "quota_reset_date_utc") ?? readString(json, "quota_reset_date");
  const resetAt =
    resetDate === undefined ? undefined : Math.floor(new Date(resetDate).getTime() / 1000);

  // only care about premium_interactions — chat/completions are often unlimited
  const premium = rawSnapshots["premium_interactions"];
  if (!isRecord(premium)) {
    return null;
  }
  const percentRemaining = premium["percent_remaining"];
  if (typeof percentRemaining !== "number") {
    return null;
  }

  return [
    {
      resetAt,
      usedPercent: 100 - percentRemaining,
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
  private readonly publish: (json?: string) => void;

  constructor(publish: (json?: string) => void) {
    this.publish = publish;
  }

  activate(): void {
    this.generation++;
    this.state = "idle";
    this.stopTimer();
    this.poll();
    this.timer = setInterval(() => {
      this.poll();
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

  private poll(): void {
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
    this.inFlight = this.runFetch(gen);
  }

  private async runFetch(gen: number): Promise<void> {
    try {
      await this.doFetch(gen);
    } finally {
      this.inFlight = undefined;
    }
  }

  private async doFetch(gen: number): Promise<void> {
    try {
      const req = await buildRequest();
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

export default function statuslineCopilot(pi: ExtensionAPI) {
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
