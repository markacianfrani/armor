#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assistantText,
  closeRunTab,
  createRunTab,
  effectiveRunState,
  getRunsDir,
  inboxDir,
  isValidRunName,
  launchRun,
  listRuns,
  paneExists,
  readLatestAssistant,
  readMetadata,
  removeRunDir,
  runDisplayName,
  updateMetadata,
  writeMetadata,
} from "./shared.ts";

const VALID_THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
const extensionPath = join(dirname(fileURLToPath(import.meta.url)), "index.ts");

function fail(message: string): never {
  throw new Error(message);
}

function usage(): never {
  return fail(`Usage:
  subagent spawn [--name <name>] [--provider <provider>] [--model <model>] [--thinking <level>]
    [--cwd <dir>] [--tools <names>] [--no-extensions] [--no-skills]
    [--no-prompt-templates] [--no-context-files] (--prompt <text> | --file <path>)...
  subagent status <handle>
  subagent rename <handle> <name>
  subagent send <handle> [--follow-up] <message>
  subagent wait <handle> [--timeout <seconds>]
  subagent stop <handle>
  subagent list`);
}

function valueAfter(args: string[], index: number, option: string): string {
  const value = args.at(index + 1);
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    fail(`${option} requires a value`);
  }
  return value;
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

interface SpawnConfig {
  cwd: string;
  files: string[];
  model: string;
  name?: string;
  noContextFiles: boolean;
  noExtensions: boolean;
  noPromptTemplates: boolean;
  noSkills: boolean;
  prompts: string[];
  provider: string;
  thinking: string;
  tools?: string;
}

function initialSpawnConfig(): SpawnConfig {
  return {
    cwd: process.cwd(),
    files: [],
    model: process.env["PI_MODEL"] ?? fail("No model specified and PI_MODEL is not set"),
    noContextFiles: false,
    noExtensions: false,
    noPromptTemplates: false,
    noSkills: false,
    prompts: [],
    provider:
      process.env["PI_PROVIDER"] ?? fail("No provider specified and PI_PROVIDER is not set"),
    thinking: process.env["PI_REASONING_LEVEL"] ?? "medium",
  };
}

const VALUE_OPTIONS = new Set([
  "--name",
  "--provider",
  "--model",
  "--thinking",
  "--cwd",
  "--tools",
]);
function applySpawnOption(config: SpawnConfig, arg: string, value: string): void {
  switch (arg) {
    case "--name": {
      config.name = value.trim();
      break;
    }
    case "--provider": {
      config.provider = value;
      break;
    }
    case "--model": {
      config.model = value;
      break;
    }
    case "--thinking": {
      config.thinking = value;
      break;
    }
    case "--cwd": {
      config.cwd = resolve(value);
      break;
    }
    case "--tools": {
      config.tools = value;
      break;
    }
    default: {
      fail(`Unknown spawn argument: ${arg}`);
    }
  }
}

function resolveSpawnFile(args: string[], index: number): string {
  const file = resolve(valueAfter(args, index, "--file"));
  if (!existsSync(file)) {
    fail(`File not found: ${file}`);
  }
  return file;
}

function parseSpawnArgs(args: string[]): SpawnConfig {
  const config = initialSpawnConfig();
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (VALUE_OPTIONS.has(arg)) {
      applySpawnOption(config, arg, valueAfter(args, index, arg));
      index++;
    } else if (arg === "--prompt") {
      config.prompts.push(valueAfter(args, index, arg));
      index++;
    } else if (arg === "--file") {
      config.files.push(resolveSpawnFile(args, index));
      index++;
    } else if (arg === "--no-extensions") {
      config.noExtensions = true;
    } else if (arg === "--no-skills") {
      config.noSkills = true;
    } else if (arg === "--no-prompt-templates") {
      config.noPromptTemplates = true;
    } else if (arg === "--no-context-files") {
      config.noContextFiles = true;
    } else {
      fail(`Unknown spawn argument: ${arg}`);
    }
  }
  return config;
}

function validateSpawnConfig(config: SpawnConfig): void {
  if (config.name !== undefined && !isValidRunName(config.name)) {
    fail("Subagent name must be a single line of 1 to 64 characters");
  }
  if (!VALID_THINKING_LEVELS.has(config.thinking)) {
    fail(`Invalid thinking level: ${config.thinking}`);
  }
  if (
    config.tools !== undefined &&
    !config.tools.split(",").some((tool) => tool.trim().length > 0)
  ) {
    fail("--tools requires at least one tool name");
  }
  if (config.prompts.length === 0 && config.files.length === 0) {
    fail("spawn requires at least one --prompt or --file");
  }
  if (!existsSync(config.cwd)) {
    fail(`Working directory not found: ${config.cwd}`);
  }
}

function runDirForHandle(handle: string): string {
  if (!/^[a-z0-9]+$/.test(handle)) {
    fail(`Invalid subagent handle: ${handle}`);
  }
  return join(getRunsDir(), handle);
}

function generateHandle(): string {
  mkdirSync(getRunsDir(), { mode: 0o700, recursive: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    const handle = randomBytes(3).toString("hex");
    if (!existsSync(runDirForHandle(handle))) {
      return handle;
    }
  }
  return fail("Could not allocate a unique subagent handle");
}

function spawnSubagent(args: string[]): void {
  if (process.env["PI_SUBAGENT_RUN_DIR"] !== undefined) {
    fail("Nested subagents are disabled");
  }
  const config = parseSpawnArgs(args);
  validateSpawnConfig(config);

  const handle = generateHandle();
  const runDir = runDirForHandle(handle);
  const sessionFile = join(runDir, "session.jsonl");
  const { paneId, tabId } = createRunTab(config.cwd, config.name ?? `subagent-${handle}`);
  mkdirSync(inboxDir(runDir), { mode: 0o700, recursive: true });
  writeFileSync(sessionFile, "", { mode: 0o600 });

  const launchArgs: string[] = [];
  if (config.tools !== undefined) {
    launchArgs.push("--tools", config.tools);
  }
  if (config.noExtensions) {
    launchArgs.push("--no-extensions", "--extension", extensionPath);
  }
  if (config.noSkills) {
    launchArgs.push("--no-skills");
  }
  if (config.noPromptTemplates) {
    launchArgs.push("--no-prompt-templates");
  }
  if (config.noContextFiles) {
    launchArgs.push("--no-context-files");
  }

  const now = new Date().toISOString();
  const metadata = {
    createdAt: now,
    cwd: config.cwd,
    handle,
    hasStarted: false,
    model: config.model,
    name: config.name,
    paneId,
    parentSessionId: process.env["PI_SESSION_ID"],
    provider: config.provider,
    runDir,
    sessionFile,
    state: "starting" as const,
    tabId,
    thinking: config.thinking,
    updatedAt: now,
    version: 1 as const,
  };
  writeMetadata(metadata);

  const initialArgs = config.files.map((file) => `@${file}`);
  if (config.prompts.length > 0) {
    initialArgs.push(`Task:\n${config.prompts.join("\n\n")}`);
  }
  try {
    launchRun(metadata, launchArgs, initialArgs);
  } catch (error) {
    closeRunTab(tabId);
    removeRunDir(runDir);
    throw error instanceof Error ? error : new Error(String(error));
  }

  process.stdout.write(`Spawned ${runDisplayName(metadata)}\nFocus: herdr tab focus ${tabId}\n`);
}

function getRun(handle: string) {
  const metadata = readMetadata(runDirForHandle(handle));
  if (metadata === undefined) {
    fail(`Unknown subagent: ${handle}`);
  }
  return metadata;
}

function statusSubagent(args: string[]): void {
  if (args.length !== 1) {
    usage();
  }
  const metadata = getRun(args[0]);
  process.stdout.write(
    `${runDisplayName(metadata)}: ${effectiveRunState(metadata)} (${metadata.provider}/${metadata.model}, ${metadata.thinking})\nFocus: herdr tab focus ${metadata.tabId}\n`,
  );
}

function renameSubagent(args: string[]): void {
  if (args.length !== 2) {
    usage();
  }
  const metadata = getRun(args[0]);
  const name = args[1].trim();
  if (!isValidRunName(name)) {
    fail("Subagent name must be a single line of 1 to 64 characters");
  }
  const updated = updateMetadata(metadata.runDir, { name });
  if (updated === undefined) {
    fail(`Could not rename subagent: ${metadata.handle}`);
  }
  process.stdout.write(`Renamed ${runDisplayName(updated)}\n`);
}

function sendVerb(state: string, followUp: boolean): string {
  if (followUp && state === "busy") {
    return "Queued follow-up for";
  }
  if (state === "idle") {
    return "Prompted";
  }
  return "Steered";
}

function sendSubagent(args: string[]): void {
  const handle = args.shift();
  if (handle === undefined) {
    usage();
  }
  let followUp = false;
  const messageParts: string[] = [];
  for (const arg of args) {
    if (arg === "--follow-up") {
      followUp = true;
    } else if (arg.startsWith("--")) {
      fail(`Unknown send argument: ${arg}`);
    } else {
      messageParts.push(arg);
    }
  }
  const message = messageParts.join(" ").trim();
  if (message.length === 0) {
    fail("send requires a message");
  }
  const metadata = getRun(handle);
  if (!paneExists(metadata.paneId)) {
    fail(`${handle} is not running`);
  }

  const queueDir = inboxDir(metadata.runDir);
  mkdirSync(queueDir, { mode: 0o700, recursive: true });
  const id = `${Date.now()}-${randomBytes(4).toString("hex")}`;
  const target = join(queueDir, `${id}.json`);
  const temporary = `${target}.tmp`;
  const payload = { delivery: followUp ? "followUp" : "auto", message } as const;
  writeFileSync(temporary, `${JSON.stringify(payload)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, target);

  const state = effectiveRunState(metadata);
  process.stdout.write(`${sendVerb(state, followUp)} ${runDisplayName(metadata)}\n`);
}

function parseTimeout(args: string[]): number {
  if (args.length === 0) {
    return 1800;
  }
  if (args.length !== 2 || args[0] !== "--timeout") {
    usage();
  }
  const timeout = Number(args[1]);
  if (!Number.isInteger(timeout) || timeout <= 0) {
    fail("--timeout must be a positive integer");
  }
  return timeout;
}

function waitSubagent(args: string[]): void {
  const handle = args.shift();
  if (handle === undefined) {
    usage();
  }
  const deadline = Date.now() + parseTimeout(args) * 1000;

  while (Date.now() < deadline) {
    const metadata = getRun(handle);
    const pending = existsSync(inboxDir(metadata.runDir))
      ? readdirSync(inboxDir(metadata.runDir)).some((file) => file.endsWith(".json"))
      : false;
    const state = effectiveRunState(metadata);
    if (state === "error") {
      fail(metadata.error ?? `${handle} failed`);
    }
    if (state === "exited") {
      fail(`${handle} exited before finishing`);
    }
    if (metadata.hasStarted && state === "idle" && !pending) {
      const message = readLatestAssistant(metadata.sessionFile);
      if (message === undefined) {
        fail(`${handle} finished without an assistant response`);
      }
      process.stdout.write(`${handle} finished\n\n${assistantText(message)}\n`);
      if (message.stopReason === "error" || message.stopReason === "aborted") {
        process.exitCode = 1;
      }
      return;
    }
    sleepSync(500);
  }
  fail(`Timed out waiting for ${handle}`);
}

function stopSubagent(args: string[]): void {
  if (args.length !== 1) {
    usage();
  }
  const metadata = getRun(args[0]);
  closeRunTab(metadata.tabId);
  removeRunDir(metadata.runDir);
  process.stdout.write(`Stopped ${runDisplayName(metadata)}\n`);
}

function listSubagents(args: string[]): void {
  if (args.length > 0) {
    usage();
  }
  const runs = listRuns(process.env["PI_SESSION_ID"]);
  if (runs.length === 0) {
    process.stdout.write("No subagents\n");
    return;
  }
  for (const metadata of runs) {
    process.stdout.write(
      `${runDisplayName(metadata)}  ${effectiveRunState(metadata).padEnd(8)}  ${metadata.provider}/${metadata.model}  ${metadata.thinking}\n`,
    );
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const command = args.shift() ?? "";
  switch (command) {
    case "spawn": {
      spawnSubagent(args);
      break;
    }
    case "status": {
      statusSubagent(args);
      break;
    }
    case "rename": {
      renameSubagent(args);
      break;
    }
    case "send": {
      sendSubagent(args);
      break;
    }
    case "wait": {
      waitSubagent(args);
      break;
    }
    case "stop": {
      stopSubagent(args);
      break;
    }
    case "list": {
      listSubagents(args);
      break;
    }
    default: {
      usage();
    }
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
