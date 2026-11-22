"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PROVIDER_ORDER,
  PROVIDERS,
  isProviderId,
  type ProviderId,
  type ProviderStatus,
  type ProvidersResponse,
} from "@/lib/providers";
import type { ApiError, ModelsResponse } from "@/lib/types";
import { ProviderIcon } from "./ProviderIcon";
import { SITE } from "@/lib/site";

export interface Connection {
  provider: ProviderId;
  model: string;
  apiKey: string;
  baseUrl: string;
  remember: boolean;
}

const SHORT_LABEL: Record<ProviderId, string> = {
  openai: "OpenAI",
  anthropic: "Claude",
  gemini: "Gemini",
  openrouter: "OpenRouter",
  groq: "Groq",
  ollama: "Ollama",
  custom: "Custom",
};

const SETTINGS_KEY = "flowforge:settings";
const KEY_PREFIX = "flowforge:key:";

interface StoredSettings {
  provider?: string;
  models?: Partial<Record<ProviderId, string>>;
  baseUrls?: Partial<Record<ProviderId, string>>;
  remember?: boolean;
}

function readSettings(): StoredSettings {
  try {
    return JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? "{}") as StoredSettings;
  } catch {
    return {};
  }
}

function writeSettings(update: (s: StoredSettings) => StoredSettings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(update(readSettings())));
  } catch {
    /* storage blocked: settings just won't persist */
  }
}

function readKey(id: ProviderId): string {
  try {
    return window.localStorage.getItem(KEY_PREFIX + id) ?? "";
  } catch {
    return "";
  }
}

function writeKey(id: ProviderId, key: string, remember: boolean) {
  try {
    if (remember && key) window.localStorage.setItem(KEY_PREFIX + id, key);
    else window.localStorage.removeItem(KEY_PREFIX + id);
  } catch {
    /* ignore */
  }
}

/** Connection state with per-browser persistence. Keys are stored only if the user opts in. */
export function useConnection() {
  const [connection, setConnection] = useState<Connection>({
    provider: "openai",
    model: "",
    apiKey: "",
    baseUrl: "",
    remember: false,
  });
  const [server, setServer] = useState<ProvidersResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore saved settings, then pick a sensible default from what the server offers.
  useEffect(() => {
    let alive = true;
    const saved = readSettings();
    fetch("/api/providers")
      .then((r) => r.json() as Promise<ProvidersResponse>)
      .catch(() => ({ providers: [], allowCustomBaseUrl: false }) as ProvidersResponse)
      .then((payload) => {
        if (!alive) return;
        setServer(payload);
        const byId = new Map(payload.providers.map((p) => [p.id, p]));
        let provider: ProviderId = "openai";
        if (isProviderId(saved.provider)) provider = saved.provider;
        else {
          const ready = payload.providers.find((p) => p.serverKey || p.reachable);
          if (ready) provider = ready.id;
        }
        const remember = saved.remember === true;
        setConnection({
          provider,
          model: saved.models?.[provider] ?? byId.get(provider)?.serverModel ?? PROVIDERS[provider].defaultModel,
          apiKey: remember ? readKey(provider) : "",
          baseUrl: saved.baseUrls?.[provider] ?? "",
          remember,
        });
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const update = useCallback(
    (patch: Partial<Connection>) => {
      setConnection((current) => {
        let next = { ...current, ...patch };
        if (patch.provider && patch.provider !== current.provider) {
          const saved = readSettings();
          const status = server?.providers.find((p) => p.id === patch.provider);
          next = {
            ...next,
            model: saved.models?.[patch.provider] ?? status?.serverModel ?? PROVIDERS[patch.provider].defaultModel,
            apiKey: next.remember ? readKey(patch.provider) : "",
            baseUrl: saved.baseUrls?.[patch.provider] ?? "",
          };
        }
        writeSettings((s) => ({
          ...s,
          provider: next.provider,
          remember: next.remember,
          models: { ...s.models, [next.provider]: next.model },
          baseUrls: { ...s.baseUrls, [next.provider]: next.baseUrl },
        }));
        writeKey(next.provider, next.apiKey, next.remember);
        if (patch.remember === false) {
          for (const id of PROVIDER_ORDER) writeKey(id, "", false);
        }
        return next;
      });
    },
    [server],
  );

  const status = server?.providers.find((p) => p.id === connection.provider);
  const info = PROVIDERS[connection.provider];
  const ready =
    !loading &&
    Boolean(connection.model.trim() || status?.serverModel) &&
    (!info.needsKey || Boolean(connection.apiKey.trim()) || Boolean(status?.serverKey)) &&
    (connection.provider !== "custom" || Boolean(connection.baseUrl.trim()) || Boolean(status?.reachable));

  /** Fields sent to the API with every request. */
  const payload = useMemo(
    () => ({
      provider: connection.provider,
      model: connection.model.trim() || undefined,
      apiKey: connection.apiKey.trim() || undefined,
      baseUrl: server?.allowCustomBaseUrl ? connection.baseUrl.trim() || undefined : undefined,
    }),
    [connection, server],
  );

  return { connection, update, server, status, loading, ready, payload };
}

const field =
  "w-full rounded-lg border border-line bg-[#090b10] px-2.5 py-2 text-[12.5px] text-text placeholder:text-[#4d5a6b] focus:border-accent/60 focus:outline-none";

export function ConnectionPanel({
  connection,
  update,
  server,
  status,
  loading,
  payload,
}: ReturnType<typeof useConnection>) {
  const info = PROVIDERS[connection.provider];
  const [models, setModels] = useState<string[]>([]);
  const [modelsState, setModelsState] = useState<{ loading: boolean; error?: string }>({ loading: false });
  const [showKey, setShowKey] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    setModels([]);
    setModelsState({ loading: false });
    setPickerOpen(false);
    setFilter("");
  }, [connection.provider]);

  const suggestions = useMemo(() => {
    const set = new Set<string>([...models, ...(status?.installedModels ?? []), ...info.suggestedModels]);
    return [...set];
  }, [models, status, info]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q ? suggestions.filter((m) => m.toLowerCase().includes(q)) : suggestions;
    return list.slice(0, 200);
  }, [suggestions, filter]);

  const loadModels = useCallback(async () => {
    setModelsState({ loading: true });
    try {
      const response = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => null)) as ModelsResponse | ApiError | null;
      if (!response.ok) {
        setModelsState({ loading: false, error: (data as ApiError | null)?.error ?? `Failed (${response.status}).` });
        return;
      }
      const list = (data as ModelsResponse).models;
      setModels(list);
      setFilter("");
      setPickerOpen(list.length > 0);
      setModelsState({ loading: false, error: list.length === 0 ? "No models found." : undefined });
    } catch {
      setModelsState({ loading: false, error: "Could not reach the server." });
    }
  }, [payload]);

  const canLoadModels =
    !info.needsKey ||
    connection.provider === "openrouter" ||
    Boolean(connection.apiKey.trim()) ||
    Boolean(status?.serverKey);

  return (
    <div className="space-y-2.5">
      <div>
        <span className="mb-1.5 block text-[11px] text-muted">AI provider</span>
        {(
          [
            { title: "Cloud · your API key", local: false },
            { title: "Local · runs on your machine", local: true },
          ] as const
        ).map((groupDef) => (
          <div key={groupDef.title} className="mb-2">
            <p className="mb-1 text-[10px] uppercase tracking-wider text-[#5b697c]">{groupDef.title}</p>
            <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={groupDef.title}>
              {PROVIDER_ORDER.filter((id) => PROVIDERS[id].local === groupDef.local).map((id) => {
                const selected = connection.provider === id;
                const st = server?.providers.find((p) => p.id === id);
                const badge = st?.serverKey ? "server key" : st?.reachable && PROVIDERS[id].local ? "detected" : null;
                // On a public server the visitor's own machine is out of reach: local models need a self-hosted copy.
                const selfHostOnly = PROVIDERS[id].local && !!server && !server.allowCustomBaseUrl && !st?.reachable;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={loading || selfHostOnly}
                    onClick={() => update({ provider: id })}
                    title={selfHostOnly ? `${PROVIDERS[id].label}: available when you run FlowForge on your own machine` : PROVIDERS[id].label}
                    className={`relative flex flex-col items-center gap-1.5 rounded-xl border px-1.5 pb-2 pt-2.5 text-center transition ${
                      selected
                        ? "border-accent/70 bg-accent/10 shadow-[0_0_0_1px_rgba(255,90,60,0.35)]"
                        : "border-line-soft bg-panel-2 hover:border-accent/40 hover:bg-[#151a24]"
                    } disabled:opacity-50`}
                  >
                    <ProviderIcon id={id} className="h-6 w-6" />
                    <span className={`text-[10.5px] leading-tight ${selected ? "text-text" : "text-[#aab5c5]"}`}>
                      {SHORT_LABEL[id]}
                    </span>
                    {selfHostOnly && (
                      <span className="text-[9px] uppercase tracking-wide text-[#5b697c]">self-host</span>
                    )}
                    {badge && (
                      <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#34d399]" title={badge} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {(info.needsKey || connection.provider === "custom") && (
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <label htmlFor="api-key" className="text-[11px] text-muted">
              API key{info.needsKey ? "" : " (optional)"}
            </label>
            {info.keyUrl && (
              <a
                href={info.keyUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[10.5px] text-accent-soft hover:underline"
              >
                Get a key ↗
              </a>
            )}
          </div>
          <div className="flex gap-1.5">
            <input
              id="api-key"
              type={showKey ? "text" : "password"}
              value={connection.apiKey}
              onChange={(event) => update({ apiKey: event.target.value })}
              placeholder={status?.serverKey ? "Leave empty to use the server key" : info.keyPlaceholder}
              autoComplete="off"
              spellCheck={false}
              className={`${field} font-mono`}
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="shrink-0 rounded-lg border border-line bg-panel-2 px-2.5 text-[11px] text-muted hover:text-text"
            >
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
          <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-[11px] text-muted">
            <input
              type="checkbox"
              checked={connection.remember}
              onChange={(event) => update({ remember: event.target.checked })}
              className="h-3.5 w-3.5 accent-[#ff5a3c]"
            />
            Remember keys on this device
          </label>
        </div>
      )}

      {info.local && (
        <div>
          <label htmlFor="base-url" className="mb-1 flex items-baseline justify-between text-[11px] text-muted">
            <span>Endpoint</span>
            {connection.provider === "ollama" && (
              <span className={status?.reachable ? "text-[#6ee7b7]" : "text-[#fca5a5]"}>
                {loading ? "checking…" : status?.reachable ? "● Ollama detected" : "● Ollama not detected"}
              </span>
            )}
          </label>
          {server?.allowCustomBaseUrl ? (
            <input
              id="base-url"
              value={connection.baseUrl}
              onChange={(event) => update({ baseUrl: event.target.value })}
              placeholder={info.baseUrl}
              spellCheck={false}
              className={`${field} font-mono`}
            />
          ) : (
            <p className="rounded-lg border border-line-soft bg-panel-2 px-2.5 py-2 text-[11px] leading-relaxed text-muted">
              Uses the endpoint configured on this server. To use a model on your own computer,{" "}
              <a href={SITE.repo} target="_blank" rel="noreferrer" className="text-accent-soft underline underline-offset-2">
                run FlowForge locally
              </a>{" "}
              (free and open source).
            </p>
          )}
          {connection.provider === "ollama" && !loading && !status?.reachable && (
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-[#8b98ab]">
              Install Ollama, then run <code className="font-mono text-[#c9f27c]">ollama pull qwen2.5-coder:7b</code>.
            </p>
          )}
        </div>
      )}

      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <label htmlFor="model" className="text-[11px] text-muted">
            Model
          </label>
          <button
            type="button"
            onClick={() => void loadModels()}
            disabled={!canLoadModels || modelsState.loading}
            className="text-[10.5px] text-accent-soft hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:no-underline"
          >
            {modelsState.loading ? "Loading…" : models.length ? `${models.length} models loaded` : "Load available models"}
          </button>
        </div>
        <div className="relative">
          <div className="flex gap-1.5">
            <input
              id="model"
              value={connection.model}
              onChange={(event) => update({ model: event.target.value })}
              placeholder={status?.serverModel || info.defaultModel || "model name"}
              spellCheck={false}
              autoComplete="off"
              className={`${field} font-mono`}
            />
            <button
              type="button"
              onClick={() => {
                setFilter("");
                setPickerOpen((v) => !v);
              }}
              disabled={suggestions.length === 0}
              aria-expanded={pickerOpen}
              aria-controls="model-picker"
              className="shrink-0 rounded-lg border border-line bg-panel-2 px-2.5 text-[11px] text-muted hover:text-text disabled:opacity-40"
            >
              {pickerOpen ? "Close" : "Browse"}
            </button>
          </div>
          {pickerOpen && (
            <div
              id="model-picker"
              className="absolute inset-x-0 top-full z-20 mt-1 rounded-lg border border-line bg-[#0d1017] p-1.5 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.8)]"
            >
              <input
                autoFocus
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setPickerOpen(false);
                  if (event.key === "Enter" && visible[0]) {
                    event.preventDefault();
                    update({ model: visible[0] });
                    setPickerOpen(false);
                  }
                }}
                placeholder={`Search ${suggestions.length} models…`}
                spellCheck={false}
                className="mb-1 w-full rounded-md border border-line bg-[#090b10] px-2 py-1.5 text-[11.5px] text-text placeholder:text-[#4d5a6b] focus:border-accent/60 focus:outline-none"
              />
              <ul role="listbox" aria-label="Models" className="scroll-thin max-h-60 overflow-y-auto">
                {visible.length === 0 && <li className="px-2 py-1.5 text-[11px] text-muted">No match.</li>}
                {visible.map((m) => (
                  <li key={m}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={m === connection.model}
                      onClick={() => {
                        update({ model: m });
                        setPickerOpen(false);
                      }}
                      className={`block w-full truncate rounded px-2 py-1 text-left font-mono text-[11px] ${
                        m === connection.model ? "bg-accent/15 text-text" : "text-[#aab5c5] hover:bg-[#151a24] hover:text-text"
                      }`}
                    >
                      {m}
                    </button>
                  </li>
                ))}
              </ul>
              {suggestions.length > visible.length && !filter && (
                <p className="px-2 pt-1 text-[10px] text-[#5b697c]">Showing 200 — type to search the rest.</p>
              )}
            </div>
          )}
        </div>
        {modelsState.error && <p className="mt-1 text-[10.5px] text-[#fca5a5]">{modelsState.error}</p>}
      </div>

      <p className="text-[10.5px] leading-relaxed text-[#556274]">
        {info.local
          ? "Local models run on your hardware: free and private, but smaller models make more mistakes."
          : `Your key goes only to this FlowForge server, which forwards it to ${info.label}. It is never stored on the server${connection.remember ? "; it is saved in this browser" : ""}.`}
      </p>
    </div>
  );
}

export function connectionLabel(connection: Connection, status?: ProviderStatus): string {
  const model = connection.model.trim() || status?.serverModel || PROVIDERS[connection.provider].defaultModel;
  return `${PROVIDERS[connection.provider].label} · ${model}`;
}
