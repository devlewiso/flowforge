import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderError, resolveProvider } from "./llm";
import { normalizeWorkflow } from "./n8n";

afterEach(() => vi.unstubAllEnvs());

describe("resolveProvider", () => {
  it("uses the key typed in the browser over the server key", () => {
    vi.stubEnv("OPENAI_API_KEY", "server-key");
    const p = resolveProvider({ provider: "openai", apiKey: "user-key" });
    expect(p.apiKey).toBe("user-key");
    expect(p.keySource).toBe("user");
    expect(p.model).toBe("gpt-4o-mini");
  });

  it("falls back to the server key", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "server-key");
    const p = resolveProvider({ provider: "anthropic" });
    expect(p.keySource).toBe("server");
    expect(p.model).toBe("claude-opus-5-5");
  });

  it("asks for a key when a cloud provider has none", () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(() => resolveProvider({ provider: "gemini" })).toThrow(ProviderError);
  });

  it("does not need a key for Ollama", () => {
    const p = resolveProvider({ provider: "ollama", model: "qwen3:8b" });
    expect(p.keySource).toBe("none");
    expect(p.baseUrl).toMatch(/\/v1$/);
  });

  it("rejects browser endpoints when custom base URLs are disabled", () => {
    vi.stubEnv("ALLOW_CUSTOM_BASE_URL", "false");
    expect(() => resolveProvider({ provider: "ollama", baseUrl: "http://169.254.169.254" })).toThrow(/custom endpoints/);
  });

  it("only accepts http(s) endpoints without credentials", () => {
    vi.stubEnv("ALLOW_CUSTOM_BASE_URL", "true");
    expect(() => resolveProvider({ provider: "custom", model: "x", baseUrl: "file:///etc/passwd" })).toThrow();
    expect(() => resolveProvider({ provider: "custom", model: "x", baseUrl: "http://u:p@localhost:1234/v1" })).toThrow();
    expect(resolveProvider({ provider: "ollama", baseUrl: "http://127.0.0.1:11434" }).baseUrl).toBe(
      "http://127.0.0.1:11434/v1",
    );
  });

  it("blocks LAN, metadata and public hosts unless allow-listed", () => {
    vi.stubEnv("ALLOW_CUSTOM_BASE_URL", "true");
    for (const url of ["http://192.168.1.1", "http://169.254.169.254", "http://10.0.0.5:8080", "http://evil.example"]) {
      expect(() => resolveProvider({ provider: "custom", model: "x", baseUrl: url })).toThrow(/not allowed/);
    }
    vi.stubEnv("ALLOWED_ENDPOINT_HOSTS", "192.168.1.50, gpu-box.lan");
    expect(resolveProvider({ provider: "ollama", baseUrl: "http://192.168.1.50:11434" }).userEndpoint).toBe(true);
    expect(() => resolveProvider({ provider: "ollama", baseUrl: "http://192.168.1.51:11434" })).toThrow(/not allowed/);
  });

  it("ignores a browser endpoint for cloud providers", () => {
    vi.stubEnv("ALLOW_CUSTOM_BASE_URL", "true");
    const p = resolveProvider({ provider: "openai", apiKey: "k", baseUrl: "http://evil.example" });
    expect(p.baseUrl).toBe("https://api.openai.com/v1");
  });
});

describe("schedule trigger check", () => {
  const wf = (type: string) => ({
    nodes: [
      { name: "Start", type, parameters: {} },
      { name: "Send", type: "n8n-nodes-base.telegram", parameters: {} },
    ],
    connections: { Start: { main: [[{ node: "Send", type: "main", index: 0 }]] } },
  });

  it("warns when a time-based description has no schedule trigger", () => {
    const { issues } = normalizeWorkflow(wf("n8n-nodes-base.googleSheetsTrigger"), {
      description: "Cada mañana a las 8 leer un Google Sheet y mandar un resumen por Telegram",
    });
    expect(issues.some((i) => i.message.includes("Schedule Trigger"))).toBe(true);
  });

  it("stays quiet when the schedule trigger is used or the flow is event-based", () => {
    const ok = normalizeWorkflow(wf("n8n-nodes-base.scheduleTrigger"), { description: "Every day at 8 send a report" });
    expect(ok.issues.some((i) => i.message.includes("Schedule Trigger"))).toBe(false);
    const event = normalizeWorkflow(wf("n8n-nodes-base.gmailTrigger"), {
      description: "When an email arrives, forward it every time to Telegram",
    });
    expect(event.issues.some((i) => i.message.includes("Schedule Trigger"))).toBe(false);
  });
});
