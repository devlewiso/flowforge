import { siAnthropic, siGooglegemini, siOllama, siOpenrouter } from "simple-icons";
import type { ProviderId } from "@/lib/providers";

// Logos from simple-icons (CC0). OpenAI and Groq are not in the set, so they get a monogram.
const ICONS: Partial<Record<ProviderId, { path: string; color: string }>> = {
  anthropic: { path: siAnthropic.path, color: "#d97757" },
  gemini: { path: siGooglegemini.path, color: "#8e75b2" },
  openrouter: { path: siOpenrouter.path, color: "#94a3b8" },
  ollama: { path: siOllama.path, color: "#e5e7eb" },
};

const MONOGRAMS: Partial<Record<ProviderId, { text: string; color: string; bg: string }>> = {
  openai: { text: "AI", color: "#ffffff", bg: "#10a37f" },
  groq: { text: "G", color: "#ffffff", bg: "#f55036" },
};

export function ProviderIcon({ id, className = "h-6 w-6" }: { id: ProviderId; className?: string }) {
  const icon = ICONS[id];
  if (icon) {
    return (
      <svg viewBox="0 0 24 24" className={className} fill={icon.color} aria-hidden="true">
        <path d={icon.path} />
      </svg>
    );
  }
  const mono = MONOGRAMS[id];
  if (mono) {
    return (
      <span
        className={`${className} inline-flex items-center justify-center rounded-md font-bold leading-none`}
        style={{ background: mono.bg, color: mono.color, fontSize: "0.62em" }}
        aria-hidden="true"
      >
        <span className="text-[10px]">{mono.text}</span>
      </span>
    );
  }
  // Custom endpoint: a plug.
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="#9aa6b8"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 01-12 0V8zM12 17v4" />
    </svg>
  );
}
