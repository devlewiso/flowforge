/**
 * Provider catalog shared by the browser and the server. Never put secrets here.
 * Model lists are suggestions only: the UI can fetch the live list with the user's key.
 */
export type ProviderId = "openai" | "anthropic" | "gemini" | "openrouter" | "groq" | "ollama" | "custom";

export type ProviderKind = "openai-compatible" | "anthropic";

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  kind: ProviderKind;
  /** Default API base. Ollama/custom can be overridden when custom endpoints are allowed. */
  baseUrl: string;
  defaultModel: string;
  suggestedModels: string[];
  needsKey: boolean;
  /** Runs on the user's own machine / server instead of a cloud API. */
  local: boolean;
  keyUrl?: string;
  keyPlaceholder?: string;
  envKey?: string;
  envModel?: string;
  envBaseUrl?: string;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    kind: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    suggestedModels: ["gpt-4o-mini", "gpt-4o", "gpt-4.1", "gpt-4.1-mini"],
    needsKey: true,
    local: false,
    keyUrl: "https://platform.openai.com/api-keys",
    keyPlaceholder: "sk-...",
    envKey: "OPENAI_API_KEY",
    envModel: "OPENAI_MODEL",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic Claude",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com",
    defaultModel: "claude-opus-5-5",
    suggestedModels: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
    needsKey: true,
    local: false,
    keyUrl: "https://platform.claude.com/settings/keys",
    keyPlaceholder: "sk-ant-...",
    envKey: "ANTHROPIC_API_KEY",
    envModel: "ANTHROPIC_MODEL",
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    kind: "openai-compatible",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash",
    suggestedModels: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"],
    needsKey: true,
    local: false,
    keyUrl: "https://aistudio.google.com/apikey",
    keyPlaceholder: "AIza...",
    envKey: "GEMINI_API_KEY",
    envModel: "GEMINI_MODEL",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai-compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o-mini",
    suggestedModels: [
      "openai/gpt-4o-mini",
      "anthropic/claude-sonnet-5.5",
      "anthropic/claude-opus-5.5",
      "google/gemini-2.5-flash",
      "meta-llama/llama-3.3-70b-instruct",
      "deepseek/deepseek-chat",
    ],
    needsKey: true,
    local: false,
    keyUrl: "https://openrouter.ai/keys",
    keyPlaceholder: "sk-or-...",
    envKey: "OPENROUTER_API_KEY",
    envModel: "OPENROUTER_MODEL",
  },
  groq: {
    id: "groq",
    label: "Groq",
    kind: "openai-compatible",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    suggestedModels: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
    needsKey: true,
    local: false,
    keyUrl: "https://console.groq.com/keys",
    keyPlaceholder: "gsk_...",
    envKey: "GROQ_API_KEY",
    envModel: "GROQ_MODEL",
  },
  ollama: {
    id: "ollama",
    label: "Ollama (local)",
    kind: "openai-compatible",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "qwen2.5-coder:7b",
    suggestedModels: ["qwen2.5-coder:7b", "qwen3:8b", "llama3.1:8b"],
    needsKey: false,
    local: true,
    envModel: "OLLAMA_MODEL",
    envBaseUrl: "OLLAMA_BASE_URL",
  },
  custom: {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    kind: "openai-compatible",
    baseUrl: "http://localhost:1234/v1",
    defaultModel: "",
    suggestedModels: [],
    needsKey: false,
    local: true,
    keyPlaceholder: "optional",
    envKey: "LLM_API_KEY",
    envModel: "LLM_MODEL",
    envBaseUrl: "LLM_BASE_URL",
  },
};

export const PROVIDER_ORDER: ProviderId[] = ["openai", "anthropic", "gemini", "openrouter", "groq", "ollama", "custom"];

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && value in PROVIDERS;
}

/** What the browser learns about the server's configuration (never the keys themselves). */
export interface ProviderStatus {
  id: ProviderId;
  /** The server has its own key for this provider (from .env.local). */
  serverKey: boolean;
  /** Model the server uses by default. */
  serverModel: string;
  /** For local providers: reachable from the server right now. */
  reachable?: boolean;
  /** Installed models (Ollama only). */
  installedModels?: string[];
  note?: string;
}

export interface ProvidersResponse {
  providers: ProviderStatus[];
  /** Whether the browser may send its own base URL for Ollama/custom. */
  allowCustomBaseUrl: boolean;
}
