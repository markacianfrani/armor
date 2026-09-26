/**
 * Claude Code usage provider for the statusline.
 *
 * Implements the usage provider contract — see statusline.ts.
 * Reads Claude Code's own OAuth credential and polls the claude.ai usage
 * endpoint when the active model is anthropic.
 *
 *   GET https://api.anthropic.com/api/oauth/usage
 *   Authorization: Bearer <Claude Code OAuth access token>
 *   anthropic-beta: oauth-2025-04-20
 *
 * Credential sources, in order:
 *   1. macOS keychain — `security find-generic-password -s "Claude Code-credentials"`
 *      (this is where Claude Code actually stores live creds on darwin)
 *   2. ~/.claude/.credentials.json (Linux / non-keychain installs)
 *
 * The access token expires roughly every 8h and only Claude Code refreshes it
 * (refreshing rotates the refresh token, so doing it here would break Claude
 * Code's auth). When the token is stale or the request fails we fall back to
 * Claude Code's own on-disk snapshot, `~/.claude.json` → `cachedUsageUtilization`,
 * which the CLI keeps at most an hour old. The segment therefore still renders
 * when Claude Code has not been run recently.
 *
 * Windows published, in order: session (5h), weekly (7d), spend limit.
 *
 * NOTE: utilization scales differ per window and are not interchangeable —
 * five_hour/seven_day are fractions (0-1) that Claude Code multiplies by 100,
 * while extra_usage.utilization is already a percentage.
 *
 * NOTE: the spend limit carries no reset timestamp from the API. Claude Code
 * renders the monthly billing boundary; we derive the same instant as the first
 * of next month, UTC.
 */

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PROVIDER = "anthropic";
const STATUS_KEY = `usage:${PROVIDER}`;

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const OAUTH_BETA = "oauth-2025-04-20";
const KEYCHAIN_SERVICE = "Claude Code-credentials";
const CREDENTIALS_PATH = ".claude/.credentials.json";
const SNAPSHOT_PATH = ".claude.json";

const POLL_MS = 60_000;
const ERROR_BACKOFF_MS = 300_000;
const REQUEST_TIMEOUT_MS = 10_000;

const execFileAsync = promisify(execFile);

// ── Shape helpers ──

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** Accepts unix seconds, unix milliseconds, or an ISO 8601 string. */
function asEpochSeconds(value: unknown): number | undefined {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : Math.floor(parsed / 1000);
  }
  const numeric = asNumber(value);
  if (numeric === undefined || numeric <= 0) {
    return undefined;
  }
  return numeric > 1e11 ? Math.floor(numeric / 1000) : Math.floor(numeric);
}

// ── Credential ──

interface Credential {
  accessToken: string;
  expiresAt?: number;
}

function parseCredential(raw: string): Credential | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(parsed)) {
    return null;
  }
  const oauth = parsed["claudeAiOauth"];
  if (!isObject(oauth)) {
    return null;
  }
  const accessToken = asString(oauth["accessToken"]);
  if (accessToken === undefined) {
    return null;
  }
  return { accessToken, expiresAt: asNumber(oauth["expiresAt"]) };
}

async function readKeychainCredential(): Promise<Credential | null> {
  if (process.platform !== "darwin") {
    return null;
  }
  const account = process.env["USER"] ?? userInfo().username;
  try {
    const { stdout } = await execFileAsync(
      "security",
      ["find-generic-password", "-a", account, "-w", "-s", KEYCHAIN_SERVICE],
      { timeout: 5000 },
    );
    return parseCredential(stdout.trim());
  } catch {
    return null;
  }
}

async function readFileCredential(): Promise<Credential | null> {
  try {
    return parseCredential(await readFile(join(homedir(), CREDENTIALS_PATH), "utf8"));
  } catch {
    return null;
  }
}

/** Cached so we do not shell out to the keychain on every poll. */
let cached: { credential: Credential; readAt: number } | null = null;
const CREDENTIAL_TTL_MS = 60_000;

async function getCredential(): Promise<Credential | null> {
  const now = Date.now();
  if (cached !== null && now - cached.readAt < CREDENTIAL_TTL_MS) {
    return cached.credential;
  }
  const credential = (await readKeychainCredential()) ?? (await readFileCredential());
  if (credential === null) {
    return null;
  }
  cached = { credential, readAt: now };
  return credential;
}

// ── Response normalization ──

interface UsageWindow {
  usedPercent: number;
  resetAt?: number;
}

interface RawWindow {
  utilization?: unknown;
  resets_at?: unknown;
}

interface RawSpend {
  percent?: unknown;
}

interface RawExtraUsage {
  utilization?: unknown;
}

function toWindow(raw: unknown, scale: "fraction" | "percent"): UsageWindow | null {
  if (!isObject(raw)) {
    return null;
  }
  const { utilization, resets_at } = raw as RawWindow;
  const value = asNumber(utilization);
  if (value === undefined) {
    return null;
  }
  const usedPercent = Math.max(0, Math.min(100, scale === "fraction" ? value * 100 : value));
  const resetAt = asEpochSeconds(resets_at);
  return resetAt === undefined ? { usedPercent } : { resetAt, usedPercent };
}

/** First of next month, UTC — Claude Code's monthly billing boundary. */
function nextMonthStartUtc(now = new Date()): number {
  return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) / 1000);
}

/**
 * The spend limit. Prefers the dedicated `spend` block, falling back to
 * `extra_usage` — the two carry the same ratio, as an integer percent and a
 * float percent respectively.
 *
 * No dollar label is published: the bar already encodes the ratio, and the
 * absolute amounts are not worth the width. Adding a label here would also
 * suppress the ⧖ countdown, because statusline.ts checks `label` before it
 * checks COUNTDOWN_THRESHOLD.
 */
function toSpendWindow(utilization: Record<string, unknown>): UsageWindow | null {
  const spend = isObject(utilization["spend"]) ? (utilization["spend"] as RawSpend) : null;
  const extra = isObject(utilization["extra_usage"])
    ? (utilization["extra_usage"] as RawExtraUsage)
    : null;

  const usedPercent =
    (spend === null ? undefined : asNumber(spend.percent)) ??
    (extra === null ? undefined : asNumber(extra.utilization));
  if (usedPercent === undefined) {
    return null;
  }

  return {
    resetAt: nextMonthStartUtc(),
    usedPercent: Math.max(0, Math.min(100, usedPercent)),
  };
}

function buildWindows(utilization: Record<string, unknown>): UsageWindow[] {
  const windows: UsageWindow[] = [];

  const session = toWindow(utilization["five_hour"], "fraction");
  if (session !== null) {
    windows.push(session);
  }

  const weekly = toWindow(utilization["seven_day"], "fraction");
  if (weekly !== null) {
    windows.push(weekly);
  }

  const spend = toSpendWindow(utilization);
  if (spend !== null) {
    windows.push(spend);
  }

  return windows;
}

// ── Fetch ──

async function fetchLive(): Promise<UsageWindow[] | null> {
  const credential = await getCredential();
  if (credential === null) {
    return null;
  }
  // Expired tokens cannot be refreshed here without rotating Claude Code's
  // refresh token, so hand off to the on-disk snapshot instead.
  if (credential.expiresAt !== undefined && credential.expiresAt <= Date.now()) {
    return null;
  }

  const res = await fetch(USAGE_URL, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${credential.accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": "claude-cli/2.1.283 (external, cli)",
      "anthropic-beta": OAUTH_BETA,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    return null;
  }

  const json: unknown = await res.json();
  if (!isObject(json)) {
    return null;
  }
  const windows = buildWindows(json);
  return windows.length === 0 ? null : windows;
}

async function fetchSnapshot(): Promise<UsageWindow[] | null> {
  try {
    const raw = await readFile(join(homedir(), SNAPSHOT_PATH), "utf8");
    const json: unknown = JSON.parse(raw);
    if (!isObject(json)) {
      return null;
    }
    const snapshot = json["cachedUsageUtilization"];
    if (!isObject(snapshot) || !isObject(snapshot["utilization"])) {
      return null;
    }
    const windows = buildWindows(snapshot["utilization"]);
    return windows.length === 0 ? null : windows;
  } catch {
    return null;
  }
}

// ── Poller (same pattern as codex/copilot/zai) ──

type PollState = "idle" | "loading" | "ready" | "error";

class UsagePoller {
  private readonly publish: (json?: string) => void;
  private state: PollState = "idle";
  private fetchedAt = 0;
  private lastErrorAt = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private inFlight: Promise<void> | undefined;
  private generation = 0;

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
      const windows = (await fetchLive()) ?? (await fetchSnapshot());
      if (gen !== this.generation) {
        return;
      }
      if (windows === null) {
        this.fail();
        return;
      }
      this.state = "ready";
      this.fetchedAt = Date.now();
      this.publish(JSON.stringify({ windows }));
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

export default function statuslineClaude(pi: ExtensionAPI) {
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
