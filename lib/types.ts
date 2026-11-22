import type { N8nWorkflow, WorkflowIssue } from "./n8n";
import type { ProviderId } from "./providers";

export interface GenerateResponse {
  workflow: N8nWorkflow;
  issues: WorkflowIssue[];
  stats: { nodes: number; connections: number; triggers: number };
  provider: { id: ProviderId; label: string; model: string; keySource: "user" | "server" | "none" };
  durationMs: number;
  usage?: { promptTokens?: number; completionTokens?: number };
  repaired?: boolean;
}

export interface ModelsResponse {
  models: string[];
}

export interface ApiError {
  error: string;
  code?: string;
  hint?: string;
}

/** Connection settings the browser sends with each request. */
export interface ConnectionBody {
  provider?: unknown;
  model?: unknown;
  apiKey?: unknown;
  baseUrl?: unknown;
}
