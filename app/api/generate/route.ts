import { NextResponse } from "next/server";
import { chatCompletion, ProviderError, resolveProvider } from "@/lib/llm";
import { buildUserPrompt, SYSTEM_PROMPT, type GenerateOptions } from "@/lib/prompt";
import { damageSummary, extractJson, isBadlyDamaged, normalizeWorkflow, slugifyFileName } from "@/lib/n8n";
import { fail, guardRequest, parseConnection, providerErrorResponse } from "@/lib/http";
import { audit, clientIp, limitFromEnv } from "@/lib/guard";
import { findDangerousNodes, findPublicPathsToDanger } from "@/lib/danger";
import type { ConnectionBody, GenerateResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface GenerateBody extends ConnectionBody {
  prompt?: unknown;
  options?: unknown;
}

function allowDangerous(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && (value as Record<string, unknown>).allowDangerousNodes === true);
}

function parseOptions(value: unknown): GenerateOptions {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  return {
    nodeNamesLanguage: raw.nodeNamesLanguage === "es" ? "es" : "en",
    includeErrorHandling: raw.includeErrorHandling === true,
    triggerHint: typeof raw.triggerHint === "string" ? raw.triggerHint.slice(0, 120) : undefined,
  };
}

export async function POST(request: Request) {
  const started = Date.now();
  const blocked = guardRequest(
    request,
    "generate",
    { max: limitFromEnv("RATE_LIMIT_GENERATE", 20), windowMs: 10 * 60_000 },
    started,
  );
  if (blocked) return blocked;
  const response = await handle(request);
  return response;
}

async function handle(request: Request) {
  const started = Date.now();
  let body: GenerateBody;
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    return fail(400, "The request body is not valid JSON.", "BAD_BODY");
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < 12) {
    return fail(400, "Describe the process in a bit more detail (at least 12 characters).", "PROMPT_TOO_SHORT");
  }
  if (prompt.length > 4000) {
    return fail(400, "The description is too long (4000 characters max).", "PROMPT_TOO_LONG");
  }

  const connection = parseConnection(body);
  if (!connection) return fail(400, "Choose an AI provider.", "BAD_PROVIDER");

  const options = parseOptions(body.options);
  const userPrompt = buildUserPrompt(prompt, options);

  const log = (status: number, extra: Record<string, unknown> = {}) =>
    audit({
      route: "generate",
      status,
      ms: Date.now() - started,
      ip: clientIp(request),
      origin: request.headers.get("origin"),
      provider: connection.provider,
      ...extra,
    });

  try {
    const provider = resolveProvider(connection);
    // Reasoning models (Nemotron, o-series, DeepSeek R1…) spend output tokens thinking first.
    const outputBudget = provider.info.local ? 4096 : 16_000;
    const meta = {
      model: provider.model,
      keySource: provider.keySource,
      endpointHost: provider.userEndpoint ? new URL(provider.baseUrl).host : undefined,
    };

    let result = await chatCompletion(provider, {
      system: SYSTEM_PROMPT,
      user: userPrompt,
      temperature: 0.2,
      maxTokens: outputBudget,
      signal: request.signal,
    });

    let repaired = false;
    let parsed = extractJson(result.content);

    if (parsed === null) {
      repaired = true;
      const repair = await chatCompletion(provider, {
        system: SYSTEM_PROMPT,
        user: [
          userPrompt,
          "",
          "Your previous answer was not valid JSON or was incomplete. Here it is:",
          '"""',
          result.content.slice(0, 9000),
          '"""',
          "Fix the errors and return ONLY the complete workflow JSON object. No markdown.",
        ].join("\n"),
        temperature: 0,
        maxTokens: outputBudget,
        signal: request.signal,
      });
      result = repair;
      parsed = extractJson(repair.content);
    }

    if (parsed === null) {
      log(502, { ...meta, reason: "invalid json" });
      return fail(
        502,
        "The model did not return usable JSON after two attempts.",
        "INVALID_JSON",
        "Try a more capable model (Claude, GPT-4o, Gemini Pro, Llama 3.3 70B) or rephrase the description.",
      );
    }

    let normalized;
    try {
      normalized = normalizeWorkflow(parsed, { description: prompt });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid workflow.";
      log(422, { ...meta, reason: "invalid workflow" });
      return fail(422, message, "INVALID_WORKFLOW", "Rephrase the description, naming the trigger and each step.");
    }

    // Valid JSON but a broken workflow (nodes without type, links to nowhere): ask the model to fix it once.
    if (isBadlyDamaged(normalized) && !repaired) {
      repaired = true;
      try {
        const fix = await chatCompletion(provider, {
          system: SYSTEM_PROMPT,
          user: [
            userPrompt,
            "",
            "Your previous workflow had these problems:",
            damageSummary(normalized),
            "",
            'Return the complete corrected workflow JSON. Every node needs "type", "name", "parameters", "position" and "notes", and every connection must use the exact name of a declared node. No markdown.',
          ].join("\n"),
          temperature: 0,
          maxTokens: outputBudget,
          signal: request.signal,
        });
        const fixedJson = extractJson(fix.content);
        if (fixedJson !== null) {
          const candidate = normalizeWorkflow(fixedJson, { description: prompt });
          const score = (r: typeof candidate) => r.damage.dropped + r.damage.untyped + r.damage.badLinks;
          if (score(candidate) < score(normalized)) {
            normalized = candidate;
            result = { ...fix, durationMs: result.durationMs + fix.durationMs };
          }
        }
      } catch (error) {
        if (!(error instanceof ProviderError)) throw error;
        // Keep the first answer; the warnings below explain what is wrong with it.
      }
    }
    if (isBadlyDamaged(normalized)) {
      normalized.issues.unshift({
        severity: "error",
        message: `${provider.info.label} returned a badly broken workflow even after a repair attempt. Try again or pick a stronger model (Claude, GPT-4o, Gemini Pro, Llama 3.3 70B).`,
      });
    }

    // Nodes that can run commands or touch files are blocked unless the user opts in.
    const danger = findDangerousNodes(normalized.workflow);
    const publicPaths = findPublicPathsToDanger(normalized.workflow, danger);
    if (danger.length > 0 && !allowDangerous(body.options)) {
      log(422, { ...meta, reason: `dangerous nodes: ${danger.map((d) => d.type).join(",")}` });
      return fail(
        422,
        `Blocked: the workflow uses nodes that can control the n8n server — ${danger
          .map((d) => `"${d.node}" (${d.reason})`)
          .join("; ")}.`,
        "DANGEROUS_NODES",
        publicPaths.length
          ? `Worse: anyone on the internet could trigger them through ${publicPaths.join(", ")} (no authentication). If you really need this, enable "Allow dangerous nodes" in Advanced options and protect the trigger.`
          : 'If you really need these nodes, enable "Allow dangerous nodes" in Advanced options.',
      );
    }
    for (const d of danger) {
      normalized.issues.unshift({
        severity: "error",
        message: `DANGEROUS: "${d.node}" ${d.reason}. Review it carefully before activating the workflow.`,
      });
    }
    for (const path of publicPaths) {
      normalized.issues.unshift({
        severity: "error",
        message: `PUBLIC ACCESS: ${path} has no authentication, so anyone with the URL can trigger it. Set authentication on the trigger.`,
      });
    }

    const payload: GenerateResponse = {
      workflow: normalized.workflow,
      issues: normalized.issues,
      stats: normalized.stats,
      provider: { id: provider.info.id, label: provider.info.label, model: result.model, keySource: provider.keySource },
      durationMs: result.durationMs,
      usage: result.usage,
      repaired,
    };

    log(200, { ...meta, ...(danger.length ? { reason: `dangerous allowed: ${danger.length}` } : {}) });
    return NextResponse.json(payload, {
      headers: { "X-FlowFilename": slugifyFileName(normalized.workflow.name), "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ProviderError) {
      const res = providerErrorResponse(error);
      log(res.status, { reason: error.code });
      return res;
    }
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      log(499, { reason: "aborted" });
      return fail(499, "Generation was cancelled.", "ABORTED");
    }
    log(500, { reason: "internal" });
    console.error("[generate] Unexpected error:", error instanceof Error ? error.message : error);
    return fail(500, "Unexpected server error.", "INTERNAL");
  }
}
