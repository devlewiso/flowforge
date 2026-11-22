"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlowDiagram } from "@/components/FlowDiagram";
import { JsonView } from "@/components/JsonView";
import { ReviewPanel } from "@/components/ReviewPanel";
import { buildReview, buildReviewLog, type ReviewDecision } from "@/lib/review";
import { ConnectionPanel, connectionLabel, useConnection } from "@/components/ConnectionPanel";
import { groupForType, GROUP_META, nodeTypeLabel } from "@/lib/nodes";
import { slugifyFileName, type WorkflowIssue } from "@/lib/n8n";
import type { ApiError, GenerateResponse } from "@/lib/types";

const EXAMPLES = [
  {
    title: "Invoices by email",
    text: "When an email with a PDF attachment arrives in the invoices inbox, save the file to the Invoices folder in Google Drive and post the sender and file name to the #finance Slack channel.",
  },
  {
    title: "Daily report",
    text: "Every day at 8:00, read the new rows from the Sales sheet in Google Sheets, calculate the total and email a summary to sales@company.com.",
  },
  {
    title: "Order webhook",
    text: "Receive orders through a webhook, check that each has an email and a total, save them to Postgres and respond with the generated id.",
  },
  {
    title: "AI support triage",
    text: "When a message reaches the Telegram bot, classify it with OpenAI: if it is urgent, alert Slack; otherwise create a page in Notion.",
  },
];

const SEVERITY_STYLE: Record<WorkflowIssue["severity"], { label: string; icon: string; className: string }> = {
  error: { label: "Error", icon: "✕", className: "border-[#f87171]/35 bg-[#f87171]/10 text-[#fca5a5]" },
  warning: { label: "Warning", icon: "!", className: "border-[#fbbf24]/35 bg-[#fbbf24]/10 text-[#fcd34d]" },
  info: { label: "Note", icon: "i", className: "border-[#38bdf8]/30 bg-[#38bdf8]/10 text-[#7dd3fc]" },
};

function worstSeverity(issues: WorkflowIssue[]): WorkflowIssue["severity"] | null {
  if (issues.some((i) => i.severity === "error")) return "error";
  if (issues.some((i) => i.severity === "warning")) return "warning";
  if (issues.length > 0) return "info";
  return null;
}

function Icon({ name, className = "h-4 w-4" }: { name: string; className?: string }) {
  const common = {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };
  switch (name) {
    case "spark":
      return (
        <svg {...common}>
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
        </svg>
      );
    case "download":
      return (
        <svg {...common}>
          <path d="M12 4v10m0 0l-3.5-3.5M12 14l3.5-3.5M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2" />
        </svg>
      );
    case "copy":
      return (
        <svg {...common}>
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V6a1 1 0 011-1h9" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="M5 12.5l4.5 4.5L19 7" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...common}>
          <path d="M20 11a8 8 0 10-2.3 6M20 5v6h-6" />
        </svg>
      );
    case "arrow":
      return (
        <svg {...common}>
          <path d="M5 12h14m0 0l-5-5m5 5l-5 5" />
        </svg>
      );
    case "stop":
      return (
        <svg {...common}>
          <rect x="6" y="6" width="12" height="12" rx="1.5" />
        </svg>
      );
    default:
      return null;
  }
}

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const conn = useConnection();
  const [lang, setLang] = useState<"en" | "es">("en");
  const [errorHandling, setErrorHandling] = useState(false);
  const [allowDangerous, setAllowDangerous] = useState(false);
  const [triggerHint, setTriggerHint] = useState("");

  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [data, setData] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState<{ message: string; hint?: string; code?: string } | null>(null);
  const [tab, setTab] = useState<"diagram" | "json" | "issues" | "review">("diagram");
  const [decisions, setDecisions] = useState<Record<string, ReviewDecision>>({});
  const [copied, setCopied] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (status !== "loading") return;
    setElapsed(0);
    const id = window.setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, [status]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const activeLabel = connectionLabel(conn.connection, conn.status);

  const generate = useCallback(async () => {
    const text = prompt.trim();
    if (text.length < 12 || status === "loading" || !conn.ready) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("loading");
    setError(null);
    setData(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          ...conn.payload,
          options: {
            nodeNamesLanguage: lang,
            includeErrorHandling: errorHandling,
            allowDangerousNodes: allowDangerous,
            triggerHint: triggerHint.trim() || undefined,
          },
        }),
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => null)) as GenerateResponse | ApiError | null;

      if (!response.ok) {
        const apiError = (payload ?? {}) as ApiError;
        setError({
          message: apiError.error || `Generation failed (${response.status}).`,
          hint: apiError.hint,
          code: apiError.code,
        });
        setStatus("error");
        return;
      }

      setData(payload as GenerateResponse);
      setStatus("ready");
      setTab("diagram");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setStatus("idle");
        return;
      }
      setError({ message: "Could not reach the server. Check the console." });
      setStatus("error");
    } finally {
      abortRef.current = null;
    }
  }, [prompt, conn.payload, conn.ready, lang, errorHandling, allowDangerous, triggerHint, status]);

  const json = useMemo(() => (data ? JSON.stringify(data.workflow, null, 2) : ""), [data]);

  const review = useMemo(() => (data ? buildReview(data.workflow) : []), [data]);
  const reviewFlagged = review.filter((i) => i.checks.length > 0).length;

  useEffect(() => {
    setDecisions({});
  }, [data]);

  const saveFile = (content: string, name: string) => {
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const download = useCallback(() => {
    if (!data) return;
    saveFile(json, slugifyFileName(data.workflow.name));
  }, [data, json]);

  const downloadReviewLog = useCallback(() => {
    if (!data) return;
    const log = buildReviewLog(data.workflow, review, decisions, {
      provider: data.provider.label,
      model: data.provider.model,
    });
    saveFile(JSON.stringify(log, null, 2), slugifyFileName(data.workflow.name).replace(/\.json$/, "") + ".review.json");
  }, [data, review, decisions]);

  const copy = useCallback(async () => {
    if (!json) return;
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }, [json]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void generate();
    }
  };

  const showEmpty = status === "idle" && !data;
  const severity = data ? worstSeverity(data.issues) : null;
  const loadingHint =
    elapsed < 5
      ? "Reading your process…"
      : elapsed < 15
        ? "Designing the nodes…"
        : elapsed < 40
          ? "Wiring the connections…"
          : "The model is still working, this can take a while…";

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line-soft">
        <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-5 py-3.5 lg:px-8">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-[#a78bfa] shadow-[0_6px_18px_-8px_rgba(255,90,60,0.9)]">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#0b0d12]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="6" cy="6" r="2.2" />
              <circle cx="18" cy="12" r="2.2" />
              <circle cx="6" cy="18" r="2.2" />
              <path d="M8 7l8 4M8 17l8-4" />
            </svg>
          </div>
          <div className="leading-tight">
            <p className="text-[15px] font-semibold tracking-tight">
              FlowForge
              <span className="ml-2 rounded-md border border-line bg-panel-2 px-1.5 py-0.5 font-mono text-[10px] font-normal text-muted">
                n8n
              </span>
            </p>
            <p className="text-[11px] text-muted">From idea to importable workflow</p>
          </div>

          <div className="ml-auto hidden items-center gap-2 rounded-full border border-line bg-panel-2 px-3 py-1.5 text-[11px] text-muted sm:flex">
            <span
              className={`h-1.5 w-1.5 rounded-full ${conn.loading ? "animate-pulse-soft bg-[#fbbf24]" : conn.ready ? "bg-[#34d399]" : "bg-[#f87171]"}`}
              aria-hidden="true"
            />
            {conn.loading ? "Checking providers…" : conn.ready ? activeLabel : "Set up a provider"}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-5 pb-20 pt-10 lg:px-8">
        <div className="mb-8 max-w-3xl">
          <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-panel-2 px-3 py-1 text-[11px] text-muted">
            <Icon name="spark" className="h-3.5 w-3.5 text-accent-soft" />
            OpenAI · Claude · Gemini · OpenRouter · Groq · Ollama
          </p>
          <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[46px]">
            Describe the process.
            <br />
            <span className="text-gradient">Download the workflow.</span>
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
            Write your automation in plain language and get a{" "}
            <code className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[12.5px] text-[#c9f27c]">.json</code>{" "}
            file with nodes, connections and positions, ready to import into n8n. Use your own API key or a model
            running on your machine.
          </p>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[400px_minmax(0,1fr)]">
          {/* Form */}
          <section className="panel p-5 lg:sticky lg:top-5" aria-label="Workflow description">
            <div className="mb-2 flex items-baseline justify-between">
              <label htmlFor="prompt" className="text-[13px] font-medium">
                Your automation
              </label>
              <span className="font-mono text-[10.5px] text-[#5b697c]">{prompt.length}/4000</span>
            </div>
            <textarea
              id="prompt"
              ref={textareaRef}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value.slice(0, 4000))}
              onKeyDown={onKeyDown}
              rows={7}
              placeholder="e.g. When an email with an invoice arrives, save it to Drive and notify Slack…"
              className="scroll-thin w-full resize-y rounded-xl border border-line bg-[#090b10] px-3.5 py-3 text-[13.5px] leading-relaxed text-text placeholder:text-[#4d5a6b] focus:border-accent/60 focus:outline-none"
            />

            <p className="mt-3 text-[11px] font-medium uppercase tracking-wider text-[#5b697c]">Examples</p>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {EXAMPLES.map((example) => (
                <button
                  key={example.title}
                  type="button"
                  onClick={() => {
                    setPrompt(example.text);
                    textareaRef.current?.focus();
                  }}
                  className="group rounded-lg border border-line-soft bg-panel-2 px-2.5 py-2 text-left transition hover:border-accent/40 hover:bg-[#151a24]"
                >
                  <span className="block truncate text-[11.5px] font-medium text-[#cfd8e5]">{example.title}</span>
                  <span className="mt-0.5 block truncate text-[10.5px] text-[#5f6d80]">{example.text}</span>
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-2.5">
              <ConnectionPanel {...conn} />

              <details className="group rounded-lg border border-line-soft bg-panel-2 px-2.5 py-2">
                <summary className="cursor-pointer list-none text-[11.5px] text-muted marker:hidden">
                  <span className="inline-flex items-center gap-1">
                    <span className="text-[#5b697c] transition group-open:rotate-90">›</span>
                    Advanced options
                  </span>
                </summary>
                <div className="mt-3 space-y-2.5 border-t border-line-soft pt-3">
                  <label className="flex items-center justify-between gap-3 text-[11.5px] text-muted">
                    Node names
                    <select
                      value={lang}
                      onChange={(event) => setLang(event.target.value === "es" ? "es" : "en")}
                      className="rounded-md border border-line bg-[#090b10] px-2 py-1 text-[11.5px] text-text focus:outline-none"
                    >
                      <option value="en">English</option>
                      <option value="es">Spanish</option>
                    </select>
                  </label>
                  <label className="flex cursor-pointer items-center justify-between gap-3 text-[11.5px] text-muted">
                    Retries on external calls
                    <input
                      type="checkbox"
                      checked={errorHandling}
                      onChange={(event) => setErrorHandling(event.target.checked)}
                      className="h-3.5 w-3.5 accent-[#ff5a3c]"
                    />
                  </label>
                  <label className="flex cursor-pointer items-start justify-between gap-3 text-[11.5px] text-muted">
                    <span>
                      Allow dangerous nodes
                      <span className="block text-[10.5px] text-[#5f6d80]">
                        Shell commands, SSH, server files, n8n API. Blocked by default.
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={allowDangerous}
                      onChange={(event) => setAllowDangerous(event.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 accent-[#ff5a3c]"
                    />
                  </label>
                  <label className="block text-[11.5px] text-muted">
                    Preferred trigger
                    <input
                      value={triggerHint}
                      onChange={(event) => setTriggerHint(event.target.value.slice(0, 120))}
                      placeholder="webhook, daily schedule, gmail…"
                      className="mt-1 w-full rounded-md border border-line bg-[#090b10] px-2 py-1.5 text-[11.5px] text-text placeholder:text-[#4d5a6b] focus:border-accent/60 focus:outline-none"
                    />
                  </label>
                </div>
              </details>
            </div>

            <div className="mt-4">
              {status === "loading" ? (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-panel-2 px-4 py-2.5 text-[13px] font-medium text-muted transition hover:text-text"
                >
                  <Icon name="stop" className="h-3.5 w-3.5" />
                  Cancel · {elapsed}s
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void generate()}
                  disabled={prompt.trim().length < 12 || !conn.ready}
                  className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-[#ff7a5f] px-4 py-2.5 text-[13.5px] font-semibold text-[#170a06] shadow-[0_10px_30px_-14px_rgba(255,90,60,0.9)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Icon name="spark" className="h-4 w-4" />
                  Generate workflow
                  <kbd className="ml-1 rounded border border-black/20 bg-black/15 px-1.5 py-0.5 font-mono text-[10px] font-normal">
                    ⌘↵
                  </kbd>
                </button>
              )}
              <p className="mt-2 text-center text-[10.5px] leading-relaxed text-[#556274]">
                {conn.ready
                  ? "Credentials for your apps are connected later, inside n8n."
                  : "Add an API key or pick a local model to start."}
              </p>
              <p className="mt-1 text-center text-[10px] leading-relaxed text-[#465263]">
                By generating you agree to the{" "}
                <Link href="/terms" className="underline underline-offset-2 hover:text-muted">Terms</Link> and{" "}
                <Link href="/privacy" className="underline underline-offset-2 hover:text-muted">Privacy Policy</Link>.
              </p>
            </div>
          </section>

          {/* Result */}
          <section className="panel min-h-[520px] p-5" aria-label="Result" aria-live="polite">
            {showEmpty && (
              <div className="flex min-h-[460px] flex-col items-center justify-center text-center">
                <svg viewBox="0 0 320 120" className="mb-6 w-[300px] max-w-full" aria-hidden="true">
                  <defs>
                    <linearGradient id="empty-grad" x1="0" x2="1">
                      <stop offset="0" stopColor="#ff5a3c" stopOpacity="0.55" />
                      <stop offset="1" stopColor="#a78bfa" stopOpacity="0.4" />
                    </linearGradient>
                  </defs>
                  <path d="M78 60 H128 M192 60 H242" stroke="#2a3442" strokeWidth="2" strokeDasharray="5 5" />
                  <rect x="18" y="38" width="60" height="44" rx="10" fill="#10141c" stroke="#28313d" />
                  <rect x="130" y="38" width="62" height="44" rx="10" fill="#10141c" stroke="url(#empty-grad)" />
                  <rect x="242" y="38" width="60" height="44" rx="10" fill="#10141c" stroke="#28313d" />
                  <circle cx="48" cy="60" r="6" fill="#f59e0b" opacity="0.85" />
                  <circle cx="161" cy="60" r="6" fill="#ff5a3c" opacity="0.85" />
                  <circle cx="272" cy="60" r="6" fill="#a78bfa" opacity="0.85" />
                </svg>
                <p className="text-[15px] font-medium">Your workflow will appear here</p>
                <p className="mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-muted">
                  Describe the trigger, the steps and the expected result. The more specific, the better the workflow.
                </p>
                <div className="mt-6 grid w-full max-w-md gap-2 text-left sm:grid-cols-3">
                  {[
                    { n: "1", label: "Describe", detail: "what starts it and what should happen" },
                    { n: "2", label: "Review", detail: "diagram, JSON and warnings" },
                    { n: "3", label: "Import", detail: "into n8n and connect credentials" },
                  ].map((step) => (
                    <div key={step.n} className="rounded-lg border border-line-soft bg-panel-2 p-2.5">
                      <span className="font-mono text-[10px] text-accent-soft">{step.n}</span>
                      <p className="mt-0.5 text-[11.5px] font-medium">{step.label}</p>
                      <p className="text-[10.5px] leading-snug text-[#5f6d80]">{step.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {status === "loading" && (
              <div className="flex min-h-[460px] flex-col items-center justify-center text-center">
                <div className="relative mb-6 flex h-16 w-16 items-center justify-center">
                  <span className="absolute inset-0 animate-ping rounded-full bg-accent/10" />
                  <span className="absolute inset-2 rounded-full bg-accent/15" />
                  <Icon name="spark" className="relative h-6 w-6 text-accent-soft" />
                </div>
                <p className="text-[14.5px] font-medium">{loadingHint}</p>
                <p className="mt-1.5 text-[12px] text-muted">
                  Using {activeLabel}
                </p>
                <div className="mt-6 w-full max-w-sm space-y-2" aria-hidden="true">
                  {[92, 78, 85, 60].map((width, index) => (
                    <div
                      key={index}
                      className="animate-pulse-soft h-2 rounded-full bg-[#1a2230]"
                      style={{ width: `${width}%`, animationDelay: `${index * 120}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}

            {status === "error" && error?.code === "DANGEROUS_NODES" && (
              <div className="animate-fade-up flex min-h-[460px] flex-col items-center justify-center text-center">
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#34d399]/35 bg-[#34d399]/10 text-[#6ee7b7] shadow-[0_0_40px_-10px_rgba(52,211,153,0.6)]">
                  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />
                    <path d="M9 12l2 2 4-4" />
                  </svg>
                </div>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#6ee7b7]">Protected</p>
                <p className="mt-1 text-[17px] font-semibold tracking-tight">Blocked for your safety</p>
                <p className="mt-3 max-w-lg text-[12.5px] leading-relaxed text-[#c3ccd9]">{error.message.replace(/^Blocked: the/, "This")}</p>
                {error.hint && (
                  <p className="mt-3 max-w-lg rounded-lg border border-[#f87171]/30 bg-[#f87171]/10 px-3 py-2 text-[11.5px] leading-relaxed text-[#fca5a5]">
                    {error.hint}
                  </p>
                )}
                <p className="mt-4 max-w-md text-[11px] leading-relaxed text-muted">
                  FlowForge never hands you a workflow that would let strangers run commands on your server.
                </p>
              </div>
            )}

            {status === "error" && error && error.code !== "DANGEROUS_NODES" && (
              <div className="flex min-h-[460px] flex-col items-center justify-center text-center">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-[#f87171]/30 bg-[#f87171]/10 text-[#fca5a5]">
                  <span className="text-lg">✕</span>
                </div>
                <p className="text-[14.5px] font-medium">Could not generate the workflow</p>
                <p className="mt-2 max-w-md text-[12.5px] leading-relaxed text-muted">{error.message}</p>
                {error.hint && (
                  <p className="mt-3 max-w-md rounded-lg border border-line-soft bg-panel-2 px-3 py-2 text-[11.5px] leading-relaxed text-[#8b98ab]">
                    {error.hint}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => void generate()}
                  className="mt-5 inline-flex items-center gap-2 rounded-lg border border-line bg-panel-2 px-3.5 py-2 text-[12.5px] font-medium transition hover:border-accent/40"
                >
                  <Icon name="refresh" className="h-3.5 w-3.5" />
                  Try again
                </button>
              </div>
            )}

            {data && (
              <div className="animate-fade-up space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-[17px] font-semibold tracking-tight">{data.workflow.name}</h2>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
                      <span>{data.provider.label}</span>
                      <span className="text-[#39434f]">·</span>
                      <span className="font-mono text-[10.5px]">{data.provider.model}</span>
                      <span className="text-[#39434f]">·</span>
                      <span>{(data.durationMs / 1000).toFixed(1)}s</span>
                      {data.usage?.completionTokens ? (
                        <>
                          <span className="text-[#39434f]">·</span>
                          <span>{data.usage.completionTokens} tokens</span>
                        </>
                      ) : null}
                      {data.repaired && (
                        <span className="rounded border border-[#fbbf24]/30 bg-[#fbbf24]/10 px-1.5 py-px text-[10px] text-[#fcd34d]">
                          repaired
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={copy}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 text-[11.5px] text-muted transition hover:text-text"
                    >
                      <Icon name={copied ? "check" : "copy"} className="h-3.5 w-3.5" />
                      {copied ? "Copied" : "Copy"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void generate()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 text-[11.5px] text-muted transition hover:text-text"
                    >
                      <Icon name="refresh" className="h-3.5 w-3.5" />
                      Regenerate
                    </button>
                    <button
                      type="button"
                      onClick={download}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-accent to-[#ff7a5f] px-3 py-1.5 text-[11.5px] font-semibold text-[#170a06] transition hover:brightness-110"
                    >
                      <Icon name="download" className="h-3.5 w-3.5" />
                      Download .json
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md border border-line bg-panel-2 px-2 py-1 text-[10.5px] text-muted">
                    {data.stats.nodes} nodes
                  </span>
                  <span className="rounded-md border border-line bg-panel-2 px-2 py-1 text-[10.5px] text-muted">
                    {data.stats.connections} connections
                  </span>
                  <span className="rounded-md border border-line bg-panel-2 px-2 py-1 text-[10.5px] text-muted">
                    {data.stats.triggers} {data.stats.triggers === 1 ? "trigger" : "triggers"}
                  </span>
                  {data.workflow.nodes.slice(0, 3).map((node) => (
                    <span
                      key={node.id}
                      className="inline-flex items-center gap-1.5 rounded-md border border-line bg-panel-2 px-2 py-1 text-[10.5px] text-muted"
                      title={nodeTypeLabel(node.type)}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: GROUP_META[groupForType(node.type)].color }}
                        aria-hidden="true"
                      />
                      {node.name}
                    </span>
                  ))}
                  {data.workflow.nodes.length > 3 && (
                    <span className="px-1 text-[10.5px] text-[#5b697c]">+{data.workflow.nodes.length - 3}</span>
                  )}
                </div>

                <div className="flex items-center gap-1 border-b border-line-soft" role="tablist" aria-label="Workflow views">
                  {(
                    [
                      { id: "diagram", label: "Diagram" },
                      { id: "json", label: "JSON" },
                      { id: "issues", label: `Warnings${data.issues.length ? ` (${data.issues.length})` : ""}` },
                      { id: "review", label: `Review${reviewFlagged ? ` (${reviewFlagged})` : ""}` },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      role="tab"
                      aria-selected={tab === item.id}
                      onClick={() => setTab(item.id)}
                      className={`relative px-3 py-2 text-[12px] transition ${
                        tab === item.id ? "text-text" : "text-muted hover:text-[#c3ccd9]"
                      }`}
                    >
                      {item.label}
                      {item.id === "issues" && severity && (
                        <span
                          className={`ml-1.5 inline-block h-1.5 w-1.5 rounded-full ${
                            severity === "error" ? "bg-[#f87171]" : severity === "warning" ? "bg-[#fbbf24]" : "bg-[#38bdf8]"
                          }`}
                          aria-hidden="true"
                        />
                      )}
                      {tab === item.id && (
                        <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />
                      )}
                    </button>
                  ))}
                </div>

                <div role="tabpanel">
                  {tab === "diagram" && <FlowDiagram workflow={data.workflow} />}
                  {tab === "json" && <JsonView workflow={data.workflow} />}
                  {tab === "review" && (
                    <ReviewPanel
                      items={review}
                      decisions={decisions}
                      onDecide={(node, decision) => setDecisions((prev) => ({ ...prev, [node]: decision }))}
                      onDownloadLog={downloadReviewLog}
                    />
                  )}
                  {tab === "issues" && (
                    <div className="space-y-2">
                      {data.issues.length === 0 ? (
                        <div className="rounded-xl border border-[#34d399]/25 bg-[#34d399]/5 px-4 py-6 text-center">
                          <p className="text-[12.5px] text-[#6ee7b7]">No warnings: the workflow passed every check.</p>
                        </div>
                      ) : (
                        data.issues.map((issue, index) => {
                          const style = SEVERITY_STYLE[issue.severity];
                          return (
                            <div
                              key={index}
                              className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[12px] leading-relaxed ${style.className}`}
                            >
                              <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-current text-[9px] font-bold">
                                {style.icon}
                              </span>
                              <span className="min-w-0 flex-1 text-[#c3ccd9]">
                                <span className="mr-1.5 text-[10px] font-medium uppercase tracking-wide opacity-80">
                                  {style.label}
                                </span>
                                {issue.message}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line-soft bg-panel-2 px-3 py-2.5 text-[11px] text-muted">
                  <span className="font-medium text-[#c3ccd9]">Next step</span>
                  <span className="text-[#39434f]">→</span>
                  Sign off each flagged node in Review, then in n8n: Workflows → Import from File and pick your credentials.
                  <code className="ml-auto hidden rounded bg-[#090b10] px-1.5 py-0.5 font-mono text-[10px] text-[#8b98ab] sm:block">
                    {slugifyFileName(data.workflow.name)}
                  </code>
                </div>
              </div>
            )}
          </section>
        </div>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-5 text-[10.5px] text-[#556274]">
          <span>FlowForge · n8n workflow generator · not affiliated with n8n or any AI provider</span>
          <nav className="flex flex-wrap gap-4" aria-label="Legal">
            <Link href="/privacy" className="hover:text-muted">Privacy</Link>
            <Link href="/terms" className="hover:text-muted">Terms</Link>
            <Link href="/security" className="hover:text-muted">Security</Link>
            <Link href="/licenses" className="hover:text-muted">Licenses</Link>
          </nav>
          <span className="w-full font-mono sm:w-auto">no database · prompts and keys are never stored on the server</span>
        </footer>
      </main>
    </div>
  );
}
