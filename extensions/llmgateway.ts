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

import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ProviderModelConfig } from "@mariozechner/pi-coding-agent";

const PROVIDER = "llmgateway";
const DEFAULT_BASE_URL = "https://api.llmgateway.io/v1";
const API_KEY_ENV = "LLM_GATEWAY_API_KEY";
const LEGACY_API_KEY_ENV = "LLMGATEWAY_API_KEY";
const BASE_URL_ENV = "LLM_GATEWAY_BASE_URL";
const AUTH_PATH = join(homedir(), ".pi", "agent", "auth.json");
const X_SOURCE = "pi-agent";
const MODEL_DISCOVERY_TIMEOUT_MS = 8_000;
const STATUS_KEY = `usage:${PROVIDER}`;
const WEB_SEARCH_TOOL_TYPE = "web_search";

interface LlmGatewayModelsResponse {
  data?: LlmGatewayModel[];
}

interface LlmGatewayModel {
  id?: unknown;
  name?: unknown;
  architecture?: {
    input_modalities?: unknown;
  };
  providers?: Array<{
    reasoning?: unknown;
    vision?: unknown;
    tools?: unknown;
  }>;
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
    id: "auto",
    name: "Auto (LLM Gateway)",
    reasoning: true,
    input: ["text", "image"],
    cost: zeroCost(),
    contextWindow: 128000,
    maxTokens: 16384,
  },
];

function baseUrl(): string {
  return process.env[BASE_URL_ENV]?.replace(/\/+$/, "") || DEFAULT_BASE_URL;
}

function zeroCost(): ProviderModelConfig["cost"] {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}

function authKeyFromEnv(): string | undefined {
  return process.env[API_KEY_ENV] || process.env[LEGACY_API_KEY_ENV];
}

async function authKeyFromStorage(): Promise<string | undefined> {
  try {
    const raw = await readFile(AUTH_PATH, "utf-8");
    const auth = JSON.parse(raw) as Record<string, StoredAuthEntry>;
    const entry = auth[PROVIDER];
    if (!entry) {
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

async function discoverModels(): Promise<ProviderModelConfig[]> {
  const apiKey = authKeyFromEnv() ?? (await authKeyFromStorage());
  if (!apiKey) {
    return FALLBACK_MODELS;
  }

  try {
    const res = await fetch(`${baseUrl()}/models?exclude_deprecated=true`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "x-source": X_SOURCE,
      },
      signal: AbortSignal.timeout(MODEL_DISCOVERY_TIMEOUT_MS),
    });
    if (!res.ok) {
      return FALLBACK_MODELS;
    }

    const json = (await res.json()) as LlmGatewayModelsResponse;
    const raw = json.data ?? [];

    // Build the web-search capability set first, before mapping to the
    // pi-ai ProviderModelConfig shape (which has no place to carry it).
    webSearchCapableModels.clear();
    for (const model of raw) {
      if (supportsWebSearch(model)) {
        webSearchCapableModels.add(model.id as string);
      }
    }

    const models = raw.map(toProviderModel).filter(isProviderModelConfig);
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
  const providers = model.providers;
  const params = model.supported_parameters;
  return (
    Array.isArray(providers) &&
    providers.some((provider) => provider.tools === true) &&
    Array.isArray(params) &&
    params.includes("tools")
  );
}

function isProviderModelConfig(model: ProviderModelConfig | null): model is ProviderModelConfig {
  return model !== null;
}

function toProviderModel(model: LlmGatewayModel): ProviderModelConfig | null {
  if (typeof model.id !== "string" || model.id.length === 0) {
    return null;
  }
  if (model.deprecated_at || model.deactivated_at) {
    return null;
  }

  return {
    id: model.id,
    name: typeof model.name === "string" && model.name.length > 0 ? model.name : model.id,
    reasoning: supportsReasoning(model),
    input: supportsVision(model) ? ["text", "image"] : ["text"],
    cost: {
      input: parseUsdPerMillion(model.pricing?.prompt),
      output: parseUsdPerMillion(model.pricing?.completion),
      cacheRead: parseUsdPerMillion(model.pricing?.input_cache_read),
      cacheWrite: parseUsdPerMillion(model.pricing?.input_cache_write),
    },
    contextWindow: parsePositiveInteger(model.context_length) ?? 128000,
    maxTokens: parseMaxTokens(model.per_request_limits) ?? 16384,
  };
}

function supportsReasoning(model: LlmGatewayModel): boolean {
  if (model.providers?.some((provider) => provider.reasoning === true)) {
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
  if (model.providers?.some((provider) => provider.vision === true)) {
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
    if (parsed) {
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

class CostTracker {
  private total = 0;
  private active = false;
  private searchEnabled = false;

  constructor(private ctx: { ui: { setStatus: (k: string, v: string | undefined) => void } }) {}

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
    const windows: Array<{ label: string }> = [{ label: `$${this.total.toFixed(2)}` }];
    if (this.searchEnabled) {
      windows.push({ label: "search" });
    }
    this.ctx.ui.setStatus(STATUS_KEY, JSON.stringify({ windows }));
  }
}

function register(pi: ExtensionAPI, models: ProviderModelConfig[]): void {
  pi.registerProvider(PROVIDER, {
    name: "LLM Gateway",
    baseUrl: baseUrl(),
    apiKey: `$${API_KEY_ENV}`,
    api: "openai-completions",
    headers: {
      "x-source": X_SOURCE,
    },
    models,
  });
}

async function refreshProvider(pi: ExtensionAPI): Promise<ProviderModelConfig[]> {
  const models = await discoverModels();
  register(pi, models);
  return models;
}

export default async function (pi: ExtensionAPI) {
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
    if (!costTracker?.isActive()) {
      return;
    }
    const message = event.message;
    if (message.role !== "assistant") {
      return;
    }
    if ((message as AssistantMessage).provider !== PROVIDER) {
      return;
    }
    costTracker.add((message as AssistantMessage).usage.cost.total);
  });

  pi.on("before_provider_request", (event, ctx) => {
    if (!searchEnabled) {
      return;
    }
    const model = ctx.model;
    if (!model || model.provider !== PROVIDER) {
      return;
    }
    if (!webSearchCapableModels.has(model.id)) {
      return;
    }

    // payload is the OpenAI request body built by pi-ai. Append (or keep) the
    // `web_search` tool entry. Idempotent — re-emit on retry safely.
    const payload = event.payload as { tools?: Array<Record<string, unknown>> } | undefined;
    if (!payload || !Array.isArray(payload.tools)) {
      return;
    }
    if (payload.tools.some((tool) => tool["type"] === WEB_SEARCH_TOOL_TYPE)) {
      return;
    }
    payload.tools.push({ type: WEB_SEARCH_TOOL_TYPE });
  });

  pi.on("session_shutdown", () => {
    costTracker?.dispose();
    costTracker = undefined;
    searchEnabled = false;
  });

  pi.registerCommand("llmgateway-search", {
    description: "Toggle LLM Gateway native web search (on/off) for this session",
    handler: async (args, ctx) => {
      const arg = args.trim().toLowerCase();
      const next =
        arg === "on" || arg === "1" || arg === "true"
          ? true
          : arg === "off" || arg === "0" || arg === "false"
            ? false
            : !searchEnabled;

      const model = ctx.model;
      if (next && model?.provider === PROVIDER && !webSearchCapableModels.has(model.id)) {
        ctx.ui.notify(
          `Model ${model.id} does not support native web search on LLM Gateway. Pick a different model.`,
          "warning",
        );
        return;
      }

      searchEnabled = next;
      costTracker?.setSearchEnabled(next);
      ctx.ui.notify(`LLM Gateway web search ${next ? "enabled" : "disabled"}`, "info");
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
