/**
 * Shared runtime for the subagent extension and CLI: run metadata on disk,
 * the message inbox, session-JSONL reading, and Herdr tab/pane control.
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const HERDR_TIMEOUT_MS = 10_000;

const MAX_CONTROL_CODE = 31;
const DELETE_CODE = 127;

function runHerdr(args: string[]): string {
  const result = spawnSync("herdr", args, { encoding: "utf8", timeout: HERDR_TIMEOUT_MS });
  if (result.error !== undefined) {
    throw new Error(result.error.message);
  }
  if (result.status !== 0) {
    const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
    throw new Error(
      `herdr ${args.join(" ")}: ${stderr.length > 0 ? stderr : `exit code ${result.status ?? "signal"}`}`,
    );
  }
  return result.stdout;
}

function herdrJson(args: string[]): unknown {
  const stdout = runHerdr(args);
  try {
    const parsed: unknown = JSON.parse(stdout);
    return parsed;
  } catch {
    throw new Error(`herdr ${args.join(" ")}: invalid JSON output`);
  }
}

interface SessionEntry {
  type: string;
  id: string;
  parentId: string | null;
  message?: unknown;
}

interface AssistantMessage {
  role: "assistant";
  content?: unknown;
  stopReason?: string;
  errorMessage?: string;
}

interface AssistantEntry extends SessionEntry {
  type: "message";
  message: AssistantMessage;
}

function isSessionEntry(value: unknown): value is SessionEntry {
  if (!isRecord(value)) {
    return false;
  }
  const { parentId } = value;
  return (
    typeof value["type"] === "string" &&
    typeof value["id"] === "string" &&
    (parentId === null || typeof parentId === "string")
  );
}

function activeBranch(entries: SessionEntry[]): SessionEntry[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const branch: SessionEntry[] = [];
  const seen = new Set<string>();
  let current = entries.at(-1);
  while (current !== undefined && !seen.has(current.id)) {
    branch.push(current);
    seen.add(current.id);
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return branch.toReversed();
}

function isAssistantEntry(entry: SessionEntry): entry is AssistantEntry {
  if (entry.type !== "message" || !isRecord(entry.message)) {
    return false;
  }
  return entry.message["role"] === "assistant";
}

function pickString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function isRunState(value: unknown): value is RunState {
  return (
    value === "starting" ||
    value === "busy" ||
    value === "idle" ||
    value === "exited" ||
    value === "error"
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type RunState = "starting" | "busy" | "idle" | "exited" | "error";

export interface RunMetadata {
  version: 1;
  handle: string;
  name?: string;
  parentSessionId?: string;
  paneId: string;
  tabId: string;
  runDir: string;
  sessionFile: string;
  cwd: string;
  provider: string;
  model: string;
  thinking: string;
  state: RunState;
  hasStarted: boolean;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface InboxMessage {
  delivery: "auto" | "followUp";
  message: string;
}

export function getAgentDir(): string {
  return process.env["PI_CODING_AGENT_DIR"] ?? join(homedir(), ".pi", "agent");
}

export function getRunsDir(): string {
  return join(getAgentDir(), "subagents");
}

export function metadataPath(runDir: string): string {
  return join(runDir, "metadata.json");
}

export function inboxDir(runDir: string): string {
  return join(runDir, "inbox");
}

export function isValidRunName(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) {
    return false;
  }
  if (value.trim() !== value) {
    return false;
  }
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= MAX_CONTROL_CODE || code === DELETE_CODE) {
      return false;
    }
  }
  return true;
}

export function runDisplayName(metadata: RunMetadata): string {
  return metadata.name === undefined ? metadata.handle : `${metadata.name} (${metadata.handle})`;
}

export function readMetadata(runDir: string): RunMetadata | undefined {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(metadataPath(runDir), "utf8"));
  } catch {
    return undefined;
  }
  if (!isRecord(value) || value["version"] !== 1) {
    return undefined;
  }
  const { state } = value;
  if (
    typeof value["handle"] !== "string" ||
    typeof value["paneId"] !== "string" ||
    typeof value["tabId"] !== "string" ||
    typeof value["sessionFile"] !== "string" ||
    typeof value["runDir"] !== "string" ||
    typeof value["cwd"] !== "string" ||
    typeof value["provider"] !== "string" ||
    typeof value["model"] !== "string" ||
    typeof value["thinking"] !== "string" ||
    typeof value["createdAt"] !== "string" ||
    typeof value["updatedAt"] !== "string" ||
    typeof value["hasStarted"] !== "boolean" ||
    !isRunState(state)
  ) {
    return undefined;
  }
  const { name } = value;
  if (name !== undefined && !isValidRunName(name)) {
    return undefined;
  }
  return {
    createdAt: value["createdAt"],
    cwd: value["cwd"],
    error: pickString(value, "error"),
    handle: value["handle"],
    hasStarted: value["hasStarted"],
    model: value["model"],
    name,
    paneId: value["paneId"],
    parentSessionId: pickString(value, "parentSessionId"),
    provider: value["provider"],
    runDir: value["runDir"],
    sessionFile: value["sessionFile"],
    state,
    tabId: value["tabId"],
    thinking: value["thinking"],
    updatedAt: value["updatedAt"],
    version: 1,
  };
}

export function writeMetadata(metadata: RunMetadata): void {
  mkdirSync(dirname(metadataPath(metadata.runDir)), { mode: 0o700, recursive: true });
  const target = metadataPath(metadata.runDir);
  const temporary = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(metadata, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  renameSync(temporary, target);
}

export function updateMetadata(
  runDir: string,
  patch: Partial<RunMetadata>,
): RunMetadata | undefined {
  const current = readMetadata(runDir);
  if (current === undefined) {
    return undefined;
  }
  const next: RunMetadata = {
    ...current,
    ...patch,
    handle: current.handle,
    runDir: current.runDir,
    updatedAt: new Date().toISOString(),
    version: 1,
  };
  writeMetadata(next);
  return next;
}

export function removeRunDir(runDir: string): void {
  rmSync(runDir, { force: true, maxRetries: 10, recursive: true, retryDelay: 50 });
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", String.raw`'\''`)}'`;
}

export function createRunTab(cwd: string, label: string): { paneId: string; tabId: string } {
  if (process.env["HERDR_ENV"] !== "1") {
    throw new Error("Subagents require Pi to be running inside Herdr");
  }
  const response = herdrJson(["tab", "create", "--cwd", cwd, "--label", label, "--no-focus"]);
  const result =
    isRecord(response) && isRecord(response["result"]) ? response["result"] : undefined;
  const rootPane =
    result !== undefined && isRecord(result["root_pane"]) ? result["root_pane"] : undefined;
  const tab = result !== undefined && isRecord(result["tab"]) ? result["tab"] : undefined;
  const paneId = rootPane === undefined ? undefined : rootPane["pane_id"];
  const tabId = tab === undefined ? undefined : tab["tab_id"];
  if (typeof paneId !== "string" || typeof tabId !== "string") {
    throw new TypeError("Herdr did not return the new tab pane id");
  }
  return { paneId, tabId };
}

export function paneExists(paneId: string): boolean {
  const result = spawnSync("herdr", ["pane", "get", paneId], {
    stdio: "ignore",
    timeout: HERDR_TIMEOUT_MS,
  });
  return result.status === 0;
}

export function launchRun(
  metadata: RunMetadata,
  launchArgs: string[],
  initialArgs: string[],
): void {
  const words = [
    "env",
    `PI_SUBAGENT_RUN_DIR=${shellQuote(metadata.runDir)}`,
    "pi",
    "--session",
    shellQuote(metadata.sessionFile),
    "--provider",
    shellQuote(metadata.provider),
    "--model",
    shellQuote(metadata.model),
    "--thinking",
    shellQuote(metadata.thinking),
    ...launchArgs.map((word) => shellQuote(word)),
    ...initialArgs.map((word) => shellQuote(word)),
  ];
  runHerdr(["pane", "run", metadata.paneId, words.join(" ")]);
}

export function closeRunTab(tabId: string): boolean {
  const result = spawnSync("herdr", ["tab", "close", tabId], {
    stdio: "ignore",
    timeout: HERDR_TIMEOUT_MS,
  });
  return result.status === 0;
}

export function effectiveRunState(metadata: RunMetadata): RunState {
  const running =
    metadata.state === "starting" || metadata.state === "busy" || metadata.state === "idle";
  if (running && !paneExists(metadata.paneId)) {
    return "exited";
  }
  return metadata.state;
}

export function listRuns(parentSessionId?: string): RunMetadata[] {
  const root = getRunsDir();
  if (!existsSync(root)) {
    return [];
  }
  const runs: RunMetadata[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const metadata = readMetadata(join(root, entry.name));
      if (
        metadata !== undefined &&
        (parentSessionId === undefined || metadata.parentSessionId === parentSessionId)
      ) {
        runs.push(metadata);
      }
    }
  }
  return runs.toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function readLatestAssistant(sessionFile: string): AssistantMessage | undefined {
  let content: string;
  try {
    content = readFileSync(sessionFile, "utf8");
  } catch {
    return undefined;
  }
  const entries: SessionEntry[] = [];
  for (const line of content.split("\n")) {
    if (line.trim().length > 0) {
      try {
        const value: unknown = JSON.parse(line);
        if (isSessionEntry(value)) {
          entries.push(value);
        }
      } catch {
        // The final JSONL record may still be mid-append.
      }
    }
  }
  return activeBranch(entries).findLast((entry) => isAssistantEntry(entry))?.message;
}

export function assistantText(message: AssistantMessage): string {
  if (!Array.isArray(message.content)) {
    return message.errorMessage ?? "(no response text)";
  }
  const parts: string[] = [];
  for (const item of message.content) {
    if (isRecord(item) && item["type"] === "text" && typeof item["text"] === "string") {
      parts.push(item["text"]);
    }
  }
  const text = parts.join("\n").trim();
  if (text.length > 0) {
    return text;
  }
  if (message.errorMessage !== undefined) {
    return message.errorMessage;
  }
  return "(no response text)";
}
