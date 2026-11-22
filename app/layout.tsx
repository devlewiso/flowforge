import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlowForge · n8n workflows from plain language",
  description:
    "Describe your automation and download an n8n workflow .json ready to import. Bring your own key for OpenAI, Claude, Gemini, OpenRouter or Groq, or run a local model with Ollama.",
  keywords: ["n8n", "workflow", "automation", "generator", "json", "low-code", "ai", "ollama", "claude", "openai"],
  openGraph: {
    title: "FlowForge · n8n workflows from plain language",
    description: "From plain language to an importable n8n workflow .json.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-backdrop" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
