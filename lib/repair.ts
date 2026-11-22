import type { N8nNode, WorkflowIssue } from "./n8n";

/**
 * Fixes the mistakes LLMs make most often in n8n parameters, found by importing and running generated
 * workflows in a real n8n (2.31). Every fix is reported as an issue so nothing changes silently.
 */

const CODE_KEYS = new Set(["jsCode", "pythonCode", "code", "functionCode", "query"]);

function uuid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2)}`;
}

/** "=json.body.name" → "={{ $json.body.name }}"; "{{ $json.x }}" → "={{ $json.x }}". */
export function repairExpression(value: string): string {
  let v = value;
  v = v.replace(/^=(\s*=)+/, "=");
  if (/^=\s+\{\{/.test(v)) v = "=" + v.replace(/^=\s+/, "");
  if (!v.startsWith("=") && /\{\{[\s\S]*\}\}/.test(v)) return "=" + v;
  if (v.startsWith("=") && !v.includes("{{")) {
    const body = v.slice(1).trim();
    // Only wrap things that look like code, not literal text that happens to start with "=".
    if (/^(\$?(json|node|input|now|today|vars|env|execution|workflow)\b|\$\(|new Date\(|DateTime\.)/.test(body)) {
      const fixed = body.replace(/^json\b/, "$json").replace(/^input\b/, "$input").replace(/^now\b/, "$now");
      return `={{ ${fixed} }}`;
    }
  }
  return v;
}

function walk(value: unknown, key: string, changed: { n: number }): unknown {
  if (typeof value === "string") {
    if (CODE_KEYS.has(key)) return value;
    const fixed = repairExpression(value);
    if (fixed !== value) changed.n += 1;
    return fixed;
  }
  if (Array.isArray(value)) return value.map((v) => walk(v, key, changed));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = walk(v, k, changed);
    return out;
  }
  return value;
}

const typeOf = (node: N8nNode) => node.type.toLowerCase();

function guessType(value: unknown): string {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) return "array";
  if (value && typeof value === "object") return "object";
  return "string";
}

function toAssignment(entry: unknown): Record<string, unknown> | null {
  if (!entry || typeof entry !== "object") return null;
  const e = entry as Record<string, unknown>;
  const name = typeof e.name === "string" ? e.name : typeof e.key === "string" ? e.key : null;
  if (!name) return null;
  const value = e.value ?? "";
  return { id: typeof e.id === "string" ? e.id : uuid(), name, value, type: typeof e.type === "string" ? e.type : guessType(value) };
}

export function repairNodes(nodes: N8nNode[], issues: WorkflowIssue[]): void {
  const fixed = (node: N8nNode, what: string) => issues.push({ severity: "info", message: `Fixed "${node.name}": ${what}.` });
  const hasRespondNode = nodes.some((n) => typeOf(n) === "n8n-nodes-base.respondtowebhook");

  for (const node of nodes) {
    const p = node.parameters;
    const t = typeOf(node);

    // 1 · Expressions written without {{ }} or without the leading "=".
    const changed = { n: 0 };
    node.parameters = walk(p, "", changed) as Record<string, unknown>;
    if (changed.n) fixed(node, `${changed.n} expression(s) rewritten to n8n syntax ={{ … }}`);
    const params = node.parameters;

    // 2 · Edit Fields (Set) v3: assignments must be { assignments: [{ id, name, value, type }] }.
    if (t === "n8n-nodes-base.set" && node.typeVersion >= 3) {
      const raw = params.assignments;
      const list = Array.isArray(raw)
        ? raw
        : raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).assignments)
          ? null
          : Array.isArray((params.values as Record<string, unknown> | undefined)?.string)
            ? ((params.values as Record<string, unknown>).string as unknown[])
            : null;
      if (list) {
        const assignments = list.map(toAssignment).filter((a): a is Record<string, unknown> => a !== null);
        node.parameters = { mode: "manual", assignments: { assignments }, includeOtherFields: params.includeOtherFields ?? true, options: {} };
        fixed(node, "fields converted to the Set v3 format");
      } else if (!raw && params.mode !== "raw") {
        issues.push({ severity: "warning", message: `"${node.name}" (Edit Fields) sets no fields; it will pass items through unchanged.` });
      }
    }

    // 3 · Webhook: relative path without leading slash, and the right response mode.
    if (t === "n8n-nodes-base.webhook") {
      if (typeof params.path === "string" && params.path.startsWith("/")) {
        params.path = params.path.replace(/^\/+/, "");
        fixed(node, "webhook path without leading slash");
      }
      const valid = ["onReceived", "lastNode", "responseNode", "streaming"];
      const wanted = hasRespondNode ? "responseNode" : valid.includes(String(params.responseMode)) ? params.responseMode : "onReceived";
      if (params.responseMode !== wanted) {
        params.responseMode = wanted;
        fixed(node, hasRespondNode ? "responds through the Respond to Webhook node" : "valid response mode");
      }
    }

    // 4 · Respond to Webhook with a body that is not a real expression → return the incoming item.
    if (t === "n8n-nodes-base.respondtowebhook") {
      const body = params.responseBody;
      if (params.respondWith === "json" && (typeof body !== "string" || !/^=\{\{[\s\S]+\}\}$/.test(body.trim()) && !/^=?\s*[{[]/.test(body))) {
        params.respondWith = "firstIncomingItem";
        delete params.responseBody;
        fixed(node, "responds with the incoming item");
      }
    }

    // 5 · Send Email: addresses are plain strings, and the format must match the body field.
    if (t === "n8n-nodes-base.emailsend") {
      for (const k of ["fromEmail", "toEmail", "ccEmail", "bccEmail"]) {
        const v = params[k];
        if (v && typeof v === "object" && "value" in (v as Record<string, unknown>)) {
          params[k] = String((v as Record<string, unknown>).value ?? "");
          fixed(node, `${k} as plain text`);
        }
      }
      if (!params.emailFormat) params.emailFormat = params.html ? "html" : "text";
      if (params.message && !params.text && !params.html) {
        params.text = params.message;
        delete params.message;
      }
    }

    // 6 · Things we cannot fix: flag them clearly.
    if (t === "n8n-nodes-base.code" && !(typeof params.jsCode === "string" && params.jsCode.trim()) && !(typeof params.pythonCode === "string" && params.pythonCode.trim())) {
      issues.push({ severity: "error", message: `"${node.name}" is a Code node without code; add the logic before running it.` });
    }
    if ((t === "n8n-nodes-base.postgres" || t === "n8n-nodes-base.mysql") && typeof params.query === "string" && /\$\d/.test(params.query)) {
      const opts = (params.options ?? {}) as Record<string, unknown>;
      if (!opts.queryReplacement) {
        issues.push({ severity: "warning", message: `"${node.name}" uses $1/$2 placeholders but sets no values for them (Options → Query Parameters).` });
      }
    }
  }
}
