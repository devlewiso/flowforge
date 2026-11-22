import Anthropic from "@anthropic-ai/sdk";
import { endpointHostAllowed } from "./guard";
import { PROVIDERS, type ProviderId, type ProviderInfo, type ProviderStatus } from "./providers";

/** A fully resolved connection: which API, which model, which key. Server-only. */
export interface ResolvedProvider {
  info: ProviderInfo;
  model: string;
  baseUrl: string;
  apiKey?: string;
  /** "user" = key typed in the browser; "server" = key from .env.local; "none" = local, no key. */
  keySource: "user" | "server" | "none";
  /** The base URL came from the browser (only possible for Ollama/custom). */
  userEndpoint: boolean;
}

export class ProviderError extends Error {
  code:
    | "unauthorized"
    | "model_not_found"
    | "unreachable"
    | "timeout"
    | "rate_limited"
    | "refused"
    | "http"
    | "empty"
    | "truncated"
    | "bad_request";

  constructor(code: ProviderError["code"], message: string) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
  }
}

const CLOUD_TIMEOUT_MS = 120_000;
const LOCAL_TIMEOUT_MS = 180_000;

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function env(name?: string): string | undefined {
  if (!name) return undefined;
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/**
 * Browser-supplied base URLs make the server call arbitrary hosts (SSRF), so they are
 * only accepted when the app runs on your own machine. Set ALLOW_CUSTOM_BASE_URL=true
 * to force it on, or =false to force it off.
 */
export function customBaseUrlAllowed(): boolean {
  const flag = process.env.ALLOW_CUSTOM_BASE_URL?.trim().toLowerCase();
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV !== "production";
}

function serverBaseUrl(info: ProviderInfo): string {
  const fromEnv = env(info.envBaseUrl);
  if (!fromEnv) return info.baseUrl;
  const clean = trimSlash(fromEnv);
  // OLLAMA_BASE_URL is usually given without /v1.
  return info.id === "ollama" && !/\/v1$/.test(clean) ? `${clean}/v1` : clean;
}

function validBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProviderError("bad_request", "The base URL is not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ProviderError("bad_request", "The base URL must start with http:// or https://.");
  }
  if (url.username || url.password) {
    throw new ProviderError("bad_request", "Do not put credentials inside the base URL.");
  }
  if (!endpointHostAllowed(url)) {
    throw new ProviderError(
      "bad_request",
      `Endpoint host "${url.hostname}" is not allowed. Only this machine (localhost) is allowed by default; add other hosts to ALLOWED_ENDPOINT_HOSTS.`,
    );
  }
  return trimSlash(url.toString());
}

export interface ConnectionRequest {
  provider: ProviderId;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

/** Providers whose model catalog is public (no key needed just to list models). */
export const PUBLIC_MODEL_LIST = new Set<ProviderId>(["openrouter"]);

/** Combines what the browser sent with the server's .env.local configuration. */
export function resolveProvider(req: ConnectionRequest, opts: { listing?: boolean } = {}): ResolvedProvider {
  const info = PROVIDERS[req.provider];
  const userKey = req.apiKey?.trim() || undefined;
  const serverKey = env(info.envKey);

  let baseUrl = serverBaseUrl(info);
  let userEndpoint = false;
  if (req.baseUrl?.trim() && (info.id === "ollama" || info.id === "custom")) {
    if (!customBaseUrlAllowed()) {
      throw new ProviderError(
        "bad_request",
        "This server does not accept custom endpoints. Run FlowForge on your own machine to use a local model.",
      );
    }
    baseUrl = validBaseUrl(req.baseUrl.trim());
    userEndpoint = true;
    if (info.id === "ollama" && !/\/v1$/.test(baseUrl)) baseUrl = `${baseUrl}/v1`;
  }

  const model = req.model?.trim() || env(info.envModel) || info.defaultModel;
  if (!model) throw new ProviderError("bad_request", `Choose a model for ${info.label}.`);
  if (model.length > 200) throw new ProviderError("bad_request", "The model name is too long.");

  const apiKey = userKey ?? serverKey;
  if (info.needsKey && !apiKey && !(opts.listing && PUBLIC_MODEL_LIST.has(info.id))) {
    throw new ProviderError("unauthorized", `Add your ${info.label} API key to use this provider.`);
  }
  if (info.id === "custom" && !baseUrl) {
    throw new ProviderError("bad_request", "Set the base URL of your OpenAI-compatible endpoint.");
  }

  return {
    info,
    model,
    baseUrl,
    apiKey,
    keySource: userKey ? "user" : apiKey ? "server" : "none",
    userEndpoint,
  };
}

/** Server status for the UI: which providers have a server key, and whether Ollama is running. */
let statusCache: { at: number; value: ProviderStatus[] } | null = null;

export async function providerStatuses(): Promise<ProviderStatus[]> {
  if (statusCache && Date.now() - statusCache.at < 10_000) return statusCache.value;
  const value = await computeStatuses();
  statusCache = { at: Date.now(), value };
  return value;
}

async function computeStatuses(): Promise<ProviderStatus[]> {
  const list: ProviderStatus[] = [];
  for (const info of Object.values(PROVIDERS)) {
    const status: ProviderStatus = {
      id: info.id,
      serverKey: Boolean(env(info.envKey)) && info.needsKey,
      serverModel: env(info.envModel) || info.defaultModel,
    };
    if (info.id === "custom") {
      status.reachable = Boolean(env(info.envBaseUrl) && env(info.envModel));
    }
    if (info.id === "ollama") {
      const models = await ollamaModels(serverBaseUrl(info)).catch(() => null);
      status.reachable = models !== null;
      status.installedModels = models ?? [];
      if (models && models.length === 0) status.note = "Ollama is running but has no models installed.";
      if (models && models.length > 0 && !models.includes(status.serverModel)) {
        status.serverModel = models.find((m) => !/embed/i.test(m)) ?? models[0];
      }
    }
    list.push(status);
  }
  return list;
}

async function ollamaModels(baseUrl: string): Promise<string[]> {
  const root = trimSlash(baseUrl).replace(/\/v1$/, "");
  const response = await fetch(`${root}/api/tags`, {
    signal: AbortSignal.timeout(1500),
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok) throw new Error(`Ollama ${response.status}`);
  const data = (await response.json()) as { models?: Array<{ name?: string }> };
  return (data.models ?? []).map((m) => m.name).filter((n): n is string => Boolean(n));
}

/** Live model list for a provider, using the user's key. */
export async function listModels(provider: ResolvedProvider): Promise<string[]> {
  if (provider.info.kind === "anthropic") {
    const client = new Anthropic({ apiKey: provider.apiKey, maxRetries: 0, timeout: 15_000 });
    try {
      const ids: string[] = [];
      for await (const model of client.models.list({ limit: 100 })) ids.push(model.id);
      return ids;
    } catch (error) {
      throw anthropicError(error, provider);
    }
  }
  if (provider.info.id === "ollama") {
    try {
      return await ollamaModels(provider.baseUrl);
    } catch {
      throw new ProviderError("unreachable", `Could not reach Ollama at ${provider.baseUrl}. Is it running?`);
    }
  }

  const headers: Record<string, string> = {};
  if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
  let response: Response;
  try {
    response = await fetch(`${provider.baseUrl}/models`, {
      headers,
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
      redirect: provider.info.local ? "error" : "follow",
    });
  } catch {
    throw new ProviderError("unreachable", `Could not reach ${provider.info.label}.`);
  }
  if (response.status === 401 || response.status === 403 || (provider.info.id === "gemini" && response.status === 400)) {
    throw new ProviderError("unauthorized", `${provider.info.label} rejected the API key.`);
  }
  if (!response.ok) throw new ProviderError("http", `${provider.info.label} returned ${response.status} when listing models.`);
  const data = (await response.json()) as { data?: Array<{ id?: string }> };
  return (data.data ?? [])
    .map((m) => m.id?.replace(/^models\//, ""))
    .filter((id): id is string => Boolean(id))
    .sort();
}

export interface ChatResult {
  content: string;
  model: string;
  usage?: { promptTokens?: number; completionTokens?: number };
  durationMs: number;
}

export interface ChatParams {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export async function chatCompletion(provider: ResolvedProvider, params: ChatParams): Promise<ChatResult> {
  const timeout = Number(process.env.LLM_TIMEOUT_MS) || (provider.info.local ? LOCAL_TIMEOUT_MS : CLOUD_TIMEOUT_MS);
  const timeoutSignal = AbortSignal.timeout(timeout);
  const signal = params.signal ? AbortSignal.any([timeoutSignal, params.signal]) : timeoutSignal;

  return provider.info.kind === "anthropic"
    ? anthropicChat(provider, params, signal, timeout)
    : openAiCompatibleChat(provider, params, signal);
}

// ---------- Anthropic (Messages API via the official SDK) ----------

/** Models that support server-side refusal fallbacks ("default" routing). */
const FALLBACK_MODELS = /^claude-(opus-5-5|opus-5|sonnet-5-5|fable-5-1|fable-5-2)$/;

async function anthropicChat(
  provider: ResolvedProvider,
  params: ChatParams,
  signal: AbortSignal,
  timeout: number,
): Promise<ChatResult> {
  const started = Date.now();
  const client = new Anthropic({ apiKey: provider.apiKey, maxRetries: 1, timeout });
  const withFallback = FALLBACK_MODELS.test(provider.model);

  let message: Anthropic.Beta.BetaMessage;
  try {
    // No temperature: current Claude models reject sampling parameters.
    message = await client.beta.messages.create(
      {
        model: provider.model,
        max_tokens: Math.max(params.maxTokens ?? 16_000, 16_000),
        system: params.system,
        messages: [{ role: "user", content: params.user }],
        ...(withFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      },
      { signal },
    );
  } catch (error) {
    throw anthropicError(error, provider);
  }

  if (message.stop_reason === "refusal") {
    throw new ProviderError("refused", `${provider.info.label} declined this request. Try rephrasing the process.`);
  }
  if (message.stop_reason === "max_tokens") {
    throw new ProviderError(
      "truncated",
      `${provider.info.label} hit the output limit. Split the process into smaller steps.`,
    );
  }

  const content = message.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
  if (!content.trim()) throw new ProviderError("empty", `${provider.info.label} returned an empty response.`);

  return {
    content,
    model: message.model,
    usage: { promptTokens: message.usage.input_tokens, completionTokens: message.usage.output_tokens },
    durationMs: Date.now() - started,
  };
}

function anthropicError(error: unknown, provider: ResolvedProvider): ProviderError {
  const label = provider.info.label;
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError("unauthorized", `${label} rejected the API key.`);
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new ProviderError("model_not_found", `The model "${provider.model}" does not exist on ${label}.`);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ProviderError("rate_limited", `${label} rate limit reached. Wait a moment and try again.`);
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new ProviderError("bad_request", `${label} rejected the request: ${error.message.slice(0, 300)}`);
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new ProviderError("timeout", `${label} did not respond in time. Try a faster model.`);
  }
  if (error instanceof Anthropic.APIUserAbortError) {
    const aborted = new Error("Aborted");
    aborted.name = "AbortError";
    throw aborted;
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new ProviderError("unreachable", `Could not connect to ${label}.`);
  }
  if (error instanceof Anthropic.APIError) {
    return new ProviderError("http", `${label} returned ${error.status ?? "an error"}: ${error.message.slice(0, 300)}`);
  }
  return new ProviderError("http", error instanceof Error ? error.message : `Unexpected error from ${label}.`);
}

// ---------- OpenAI-compatible (OpenAI, Gemini, OpenRouter, Groq, Ollama, custom) ----------

/** OpenAI reasoning models reject `temperature` and `max_tokens`. */
function isOpenAiReasoningModel(provider: ResolvedProvider): boolean {
  return provider.info.id === "openai" && /^(o\d|gpt-5)/i.test(provider.model);
}

async function openAiCompatibleChat(
  provider: ResolvedProvider,
  params: ChatParams,
  signal: AbortSignal,
): Promise<ChatResult> {
  const started = Date.now();
  const label = provider.info.label;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
  if (provider.info.id === "openrouter") {
    headers["X-Title"] = "FlowForge";
  }

  const maxTokens = params.maxTokens ?? 4096;
  const reasoning = isOpenAiReasoningModel(provider);
  const body: Record<string, unknown> = {
    model: provider.model,
    stream: false,
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
  };
  if (provider.info.id === "openai") body.max_completion_tokens = reasoning ? Math.max(maxTokens, 16_000) : maxTokens;
  else body.max_tokens = maxTokens;
  if (!reasoning) body.temperature = params.temperature ?? 0.2;

  // JSON mode where supported; retried without it if the endpoint rejects the field.
  const attempts = provider.info.id === "custom" ? [false] : [true, false];
  let response: Response | null = null;

  for (const jsonMode of attempts) {
    try {
      response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(jsonMode ? { ...body, response_format: { type: "json_object" } } : body),
        signal,
        cache: "no-store",
        // A local endpoint must not bounce the server somewhere else.
        redirect: provider.info.local ? "error" : "follow",
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError" && params.signal?.aborted) throw error;
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new ProviderError(
          "timeout",
          `${label} did not respond in time. Try a faster model or raise LLM_TIMEOUT_MS.`,
        );
      }
      throw new ProviderError(
        "unreachable",
        provider.info.local
          ? `Could not connect to ${label} at ${provider.baseUrl}. Is it running?`
          : `Could not connect to ${label}.`,
      );
    }

    if (response.ok) break;
    if (jsonMode && response.status === 400) {
      const detail = await response.text().catch(() => "");
      // Gemini answers 400 for a bad key; don't hide that behind the JSON-mode retry.
      if (/api[_ ]key/i.test(detail)) {
        throw new ProviderError("unauthorized", `${label} rejected the API key.`);
      }
      response = null;
      continue;
    }
    break;
  }

  if (!response) throw new ProviderError("http", `${label} rejected the request. Check the model and settings.`);

  if (!response.ok) {
    // Never echo the body of a local/custom endpoint: it could be any internal service.
    const detail = provider.info.local ? "" : (await response.text().catch(() => "")).slice(0, 600);
    if (response.status === 401 || response.status === 403) {
      throw new ProviderError("unauthorized", `${label} rejected the API key.`);
    }
    if (response.status === 404) {
      throw new ProviderError("model_not_found", `The model "${provider.model}" does not exist on ${label}.`);
    }
    if (response.status === 429) {
      throw new ProviderError("rate_limited", `${label} rate limit or quota reached. Wait a moment or check your plan.`);
    }
    throw new ProviderError("http", `${label} returned ${response.status}${detail ? `: ${detail}` : ""}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const choice = data.choices?.[0];
  const content = choice?.message?.content;

  if (choice?.finish_reason === "length") {
    throw new ProviderError(
      "truncated",
      `${label} cut the response off. Split the process into smaller steps or use a model with more context.`,
    );
  }
  if (!content || !content.trim()) throw new ProviderError("empty", `${label} returned an empty response.`);

  return {
    content,
    model: provider.model,
    usage: data.usage
      ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens }
      : undefined,
    durationMs: Date.now() - started,
  };
}
