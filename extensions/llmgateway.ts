/**
 * LLM Gateway provider extension.
 *
 * Registers an OpenAI-compatible llmgateway provider, discovers models from
 * GET /v1/models when an API key is available, and always sends x-source so
 * DevPass source attribution recognizes Pi.
 *
 * Also publishes a session-level running cost to the statusline (key
 * `usage:llmgateway`) by summing `usage.cost.total` on each llmgateway
 * assistant message. LLM Gateway has no server-side cost query endpoint
 * (unlike OpenRouter's GET /api/v1/key), so we accumulate client-side from
 * the per-turn usage that pi-ai already computes from our model pricing.
 *
 * Native web search: LLM Gateway exposes a server-executed `web_search` tool
 * (declared as `{ type: "web_search" }` in the OpenAI `tools` array). It is
 * only available on select models — we discover the per-model capability
 * during model discovery (see `discoverModels`) and gate injection by it.
 *
 * Use `/llmgateway-search on` to enable web search for the current session,
 * `/llmgateway-search off` to disable. Off by default (each search costs
 * $0.01–$0.025 per call on top of token costs).
 *
 * Auth:
 *   export LLM_GATEWAY_API_KEY=...
 * or run `/login` and pick LLM Gateway under "Use an API key".
 *
 * Optional:
 *   export LLM_GATEWAY_BASE_URL=https://api.llmgateway.io/v1
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ExtensionAPI, ProviderModelConfig } from "@mariozechner/pi-coding-agent";

const PROVIDER = "llmgateway";
const DEFAULT_BASE_URL = "https://api.llmgateway.io/v1";
const API_KEY_ENV = "LLM_GATEWAY_API_KEY";
const LEGACY_API_KEY_ENV = "LLMGATEWAY_API_KEY";
const BASE_URL_ENV = "LLM_GATEWAY_BASE_URL";
const AUTH_PATH = join(homedir(), ".pi", "agent", "auth.json");
const X_SOURCE = "pi-agent";
const MODEL_DISCOVERY_TIMEOUT_MS = 8000;
const STATUS_KEY = `usage:${PROVIDER}`;
const WEB_SEARCH_TOOL_TYPE = "web_search";

interface LlmGatewayModel {
  id?: unknown;
  name?: unknown;
  architecture?: {
    input_modalities?: unknown;
  };
  providers?: {
    reasoning?: unknown;
    vision?: unknown;
    tools?: unknown;
  }[];
  pricing?: {
    prompt?: unknown;
    completion?: unknown;
    input_cache_read?: unknown;
    input_cache_write?: unknown;
    web_search?: unknown;
  };
  context_length?: unknown;
  per_request_limits?: Record<string, unknown>;
  supported_parameters?: unknown;
  deprecated_at?: unknown;
  deactivated_at?: unknown;
}

interface StoredAuthEntry {
  type?: unknown;
  key?: unknown;
  access?: unknown;
}

/**
 * Model ids that LLM Gateway reports as having native web search support.
 * Populated during `discoverModels()`; checked at request time to gate
 * `web_search` injection. Models not in this set will reject the tool with
 * a 400 from LLM Gateway, so we never inject blindly.
 */
const webSearchCapableModels = new Set<string>();

const FALLBACK_MODELS: ProviderModelConfig[] = [
  {
    contextWindow: 128_000,
    cost: zeroCost(),
    id: "auto",
    input: ["text", "image"],
    maxTokens: 16_384,
    name: "Auto (LLM Gateway)",
    reasoning: true,
  },
];

function baseUrl(): string {
  const configured = process.env[BASE_URL_ENV]?.replace(/\/+$/, "");
  return configured === undefined || configured === "" ? DEFAULT_BASE_URL : configured;
}

function zeroCost(): ProviderModelConfig["cost"] {
  return { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 };
}

function authKeyFromEnv(): string | undefined {
  const primary = process.env[API_KEY_ENV];
  if (primary !== undefined && primary !== "") {
    return primary;
  }
  return process.env[LEGACY_API_KEY_ENV];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function storedAuthEntry(parsed: unknown): StoredAuthEntry | undefined {
  if (!isRecord(parsed)) {
    return undefined;
  }
  const entry = parsed[PROVIDER];
  return isRecord(entry) ? entry : undefined;
}

async function authKeyFromStorage(): Promise<string | undefined> {
  try {
    const raw = await readFile(AUTH_PATH, "utf8");
    const entry = storedAuthEntry(JSON.parse(raw));
    if (entry === undefined) {
      return undefined;
    }
    if (entry.type === "api_key" && typeof entry.key === "string") {
      return resolveStoredKey(entry.key);
    }
    if (entry.type === "oauth" && typeof entry.access === "string") {
      return entry.access;
    }
  } catch {}
  return undefined;
}

function resolveStoredKey(value: string): string | undefined {
  if (value.startsWith("$")) {
    const name =
      value.startsWith("${") && value.endsWith("}") ? value.slice(2, -1) : value.slice(1);
    return process.env[name];
  }
  return value;
}

function parseModelList(parsed: unknown): LlmGatewayModel[] {
  if (!isRecord(parsed)) {
    return [];
  }
  const { data } = parsed;
  if (!isUnknownArray(data)) {
    return [];
  }
  const models: LlmGatewayModel[] = [];
  for (const item of data) {
    if (isRecord(item)) {
      models.push(item);
    }
  }
  return models;
}

async function discoverModels(): Promise<ProviderModelConfig[]> {
  const apiKey = authKeyFromEnv() ?? (await authKeyFromStorage());
  if (apiKey === undefined || apiKey === "") {
    return FALLBACK_MODELS;
  }

  try {
    const res = await fetch(`${baseUrl()}/models?exclude_deprecated=true`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "x-source": X_SOURCE,
      },
      signal: AbortSignal.timeout(MODEL_DISCOVERY_TIMEOUT_MS),
    });
    if (!res.ok) {
      return FALLBACK_MODELS;
    }

    const raw = parseModelList(await res.json());

    // Build the web-search capability set first, before mapping to the
    // pi-ai ProviderModelConfig shape (which has no place to carry it).
    webSearchCapableModels.clear();
    for (const model of raw) {
      if (typeof model.id === "string" && supportsWebSearch(model)) {
        webSearchCapableModels.add(model.id);
      }
    }

    const models = raw.flatMap((model) => {
      const config = toProviderModel(model);
      return config === null ? [] : [config];
    });
    return models.length > 0 ? models : FALLBACK_MODELS;
  } catch {
    return FALLBACK_MODELS;
  }
}

function supportsWebSearch(model: LlmGatewayModel): boolean {
  // LLM Gateway sets `pricing.web_search` (a per-call rate) on models with
  // native web search support. Some dedicated search models may not have
  // a web_search price but still accept the tool — fall back to checking
  // that at least one provider supports tools and the model has a non-zero
  // `supported_parameters` list including "tools".
  if (typeof model.pricing?.web_search === "string") {
    const rate = Number(model.pricing.web_search);
    if (Number.isFinite(rate) && rate > 0) {
      return true;
    }
  }
  const { providers } = model;
  const params = model.supported_parameters;
  return (
    Array.isArray(providers) &&
    providers.some((provider) => provider.tools === true) &&
    Array.isArray(params) &&
    params.includes("tools")
  );
}

function toProviderModel(model: LlmGatewayModel): ProviderModelConfig | null {
  if (typeof model.id !== "string" || model.id.length === 0) {
    return null;
  }
  // Skip deprecated/deactivated models; the timestamps arrive as truthy strings.
  if (Boolean(model.deprecated_at) || Boolean(model.deactivated_at)) {
    return null;
  }

  return {
    compat: openAiCompatForModel(model),
    contextWindow: parsePositiveInteger(model.context_length) ?? 128_000,
    cost: {
      cacheRead: parseUsdPerMillion(model.pricing?.input_cache_read),
      cacheWrite: parseUsdPerMillion(model.pricing?.input_cache_write),
      input: parseUsdPerMillion(model.pricing?.prompt),
      output: parseUsdPerMillion(model.pricing?.completion),
    },
    id: model.id,
    input: supportsVision(model) ? ["text", "image"] : ["text"],
    maxTokens: parseMaxTokens(model.per_request_limits) ?? 16_384,
    name: typeof model.name === "string" && model.name.length > 0 ? model.name : model.id,
    reasoning: supportsReasoning(model),
  };
}

function openAiCompatForModel(model: LlmGatewayModel): ProviderModelConfig["compat"] {
  const params = supportedParameterSet(model.supported_parameters);
  const compat: NonNullable<ProviderModelConfig["compat"]> = {
    // LLM Gateway fronts many non-OpenAI chat-completions providers. Pi's
    // default for a custom OpenAI-compatible provider sends the system prompt
    // as a `developer` message for reasoning models, but models like
    // `kimi-k2.7-code` reject that role with `tokenization failed`.
    supportsDeveloperRole: false,
  };

  if (params.has("max_tokens") && !params.has("max_completion_tokens")) {
    compat.maxTokensField = "max_tokens";
  }

  if (params.has("reasoning")) {
    // LLM Gateway documents the unified `reasoning: { effort }` object, and
    // model discovery reports it for models that do not accept OpenAI's
    // top-level `reasoning_effort` field.
    compat.thinkingFormat = "openrouter";
    compat.supportsReasoningEffort = false;
  } else if (params.has("reasoning_effort")) {
    compat.supportsReasoningEffort = true;
  } else {
    compat.supportsReasoningEffort = false;
  }

  return compat;
}

function supportedParameterSet(value: unknown): Set<string> {
  if (!Array.isArray(value)) {
    return new Set();
  }
  return new Set(value.filter((param): param is string => typeof param === "string"));
}

function supportsReasoning(model: LlmGatewayModel): boolean {
  if (model.providers?.some((provider) => provider.reasoning === true) === true) {
    return true;
  }
  const params = model.supported_parameters;
  return (
    Array.isArray(params) &&
    params.some(
      (param) =>
        param === "reasoning" || param === "reasoning_effort" || param === "include_reasoning",
    )
  );
}

function supportsVision(model: LlmGatewayModel): boolean {
  if (model.providers?.some((provider) => provider.vision === true) === true) {
    return true;
  }
  const inputModalities = model.architecture?.input_modalities;
  return Array.isArray(inputModalities) && inputModalities.includes("image");
}

function parseUsdPerMillion(value: unknown): number {
  if (typeof value !== "string" && typeof value !== "number") {
    return 0;
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return 0;
  }

  // LLM Gateway exposes OpenRouter-style per-token prices as decimal strings.
  // Pi records costs per million tokens.
  return num < 1 ? num * 1_000_000 : num;
}

function parsePositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.floor(value);
}

function parseMaxTokens(limits: Record<string, unknown> | undefined): number | undefined {
  if (!limits) {
    return undefined;
  }

  for (const key of ["max_output_tokens", "output_tokens", "completion_tokens", "max_tokens"]) {
    const parsed = parsePositiveInteger(limits[key]);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

// ── Statusline cost tracker ──
//
// Sums `usage.cost.total` from each llmgateway assistant message and
// publishes a label-only status window: { label: "$X.XX" }.
//
// The statusline renders label-only windows as plain dim text (see
// statusline.ts -> renderWindow), so the running cost shows as e.g.
// " $0.42 " next to the model name without a bar.
//
// When web search is enabled for the session, the search indicator is
// published as a second window so the user can see the toggle state in
// the same statusline slot — no statusline.ts changes required.

interface StatusContext {
  ui: { setStatus: (key: string, value: string | undefined) => void };
}

class CostTracker {
  private total = 0;
  private active = false;
  private searchEnabled = false;
  private readonly ctx: StatusContext;

  constructor(ctx: StatusContext) {
    this.ctx = ctx;
  }

  setSearchEnabled(enabled: boolean): void {
    this.searchEnabled = enabled;
    this.refresh();
  }

  activate(): void {
    if (this.active) {
      return;
    }
    this.active = true;
    this.total = 0;
    this.publishCost();
  }

  deactivate(): void {
    if (!this.active) {
      return;
    }
    this.active = false;
    this.total = 0;
    this.ctx.ui.setStatus(STATUS_KEY, undefined);
  }

  dispose(): void {
    this.deactivate();
  }

  isActive(): boolean {
    return this.active;
  }

  add(cost: number): void {
    if (!this.active || !Number.isFinite(cost) || cost <= 0) {
      return;
    }
    this.total += cost;
    this.publishCost();
  }

  /** Re-publish the current state. Call after toggling search. */
  refresh(): void {
    if (this.active) {
      this.publishCost();
    }
  }

  private publishCost(): void {
    const windows: { label: string }[] = [{ label: `$${this.total.toFixed(2)}` }];
    if (this.searchEnabled) {
      windows.push({ label: "search" });
    }
    this.ctx.ui.setStatus(STATUS_KEY, JSON.stringify({ windows }));
  }
}

function register(pi: ExtensionAPI, models: ProviderModelConfig[]): void {
  pi.registerProvider(PROVIDER, {
    api: "openai-completions",
    apiKey: `$${API_KEY_ENV}`,
    baseUrl: baseUrl(),
    headers: {
      "x-source": X_SOURCE,
    },
    models,
    name: "LLM Gateway",
  });
}

async function refreshProvider(pi: ExtensionAPI): Promise<ProviderModelConfig[]> {
  const models = await discoverModels();
  register(pi, models);
  return models;
}

/** Resolve an on/off command argument; an unrecognized value toggles `current`. */
function parseToggle(args: string, current: boolean): boolean {
  const arg = args.trim().toLowerCase();
  if (arg === "on" || arg === "1" || arg === "true") {
    return true;
  }
  if (arg === "off" || arg === "0" || arg === "false") {
    return false;
  }
  return !current;
}

export default async function llmGateway(pi: ExtensionAPI): Promise<void> {
  register(pi, await discoverModels());

  let costTracker: CostTracker | undefined;
  let searchEnabled = false;

  pi.on("session_start", (_event, ctx) => {
    costTracker = new CostTracker(ctx);
    if (ctx.model?.provider === PROVIDER) {
      costTracker.activate();
    }
  });

  pi.on("model_select", (event) => {
    if (event.model.provider === PROVIDER) {
      costTracker?.activate();
    } else {
      costTracker?.deactivate();
    }
  });

  pi.on("message_end", (event) => {
    if (costTracker?.isActive() !== true) {
      return;
    }
    const { message } = event;
    if (message.role !== "assistant") {
      return;
    }
    if (message.provider !== PROVIDER) {
      return;
    }
    costTracker.add(message.usage.cost.total);
  });

  pi.on("before_provider_request", (event, ctx) => {
    if (!searchEnabled) {
      return;
    }
    const { model } = ctx;
    if (!model || model.provider !== PROVIDER) {
      return;
    }
    if (!webSearchCapableModels.has(model.id)) {
      return;
    }

    // payload is the OpenAI request body built by pi-ai. Append (or keep) the
    // `web_search` tool entry. Idempotent — re-emit on retry safely.
    const { payload } = event;
    if (!isRecord(payload)) {
      return;
    }
    const { tools } = payload;
    if (!isUnknownArray(tools)) {
      return;
    }
    if (tools.some((tool) => isRecord(tool) && tool["type"] === WEB_SEARCH_TOOL_TYPE)) {
      return;
    }
    tools.push({ type: WEB_SEARCH_TOOL_TYPE });
  });

  pi.on("session_shutdown", () => {
    costTracker?.dispose();
    costTracker = undefined;
    searchEnabled = false;
  });

  pi.registerCommand("llmgateway-search", {
    description: "Toggle LLM Gateway native web search (on/off) for this session",
    handler: (args, ctx) => {
      const next = parseToggle(args, searchEnabled);

      const { model } = ctx;
      if (next && model?.provider === PROVIDER && !webSearchCapableModels.has(model.id)) {
        ctx.ui.notify(
          `Model ${model.id} does not support native web search on LLM Gateway. Pick a different model.`,
          "warning",
        );
        return Promise.resolve();
      }

      searchEnabled = next;
      costTracker?.setSearchEnabled(next);
      ctx.ui.notify(`LLM Gateway web search ${next ? "enabled" : "disabled"}`, "info");
      return Promise.resolve();
    },
  });

  pi.registerCommand("llmgateway-refresh", {
    description: "Refresh the LLM Gateway model list",
    handler: async (_args, ctx) => {
      const models = await refreshProvider(pi);
      ctx.ui.notify(
        `LLM Gateway: loaded ${models.length} model${models.length === 1 ? "" : "s"}`,
        "info",
      );
    },
  });
}
