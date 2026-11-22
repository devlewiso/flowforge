import { NODE_CATALOG } from "./nodes";

export interface GenerateOptions {
  /** Language of the visible node and workflow names. */
  nodeNamesLanguage?: "en" | "es";
  /** Add retries to external calls (APIs, databases). */
  includeErrorHandling?: boolean;
  /** Optional hint about the trigger (email, webhook, cron...). */
  triggerHint?: string;
}

// The example must be internally consistent: the model copies its shape.
const FORMAT_EXAMPLE = `{
  "name": "Daily sales summary to Slack",
  "nodes": [
    {
      "parameters": { "rule": { "interval": [{ "field": "days", "triggerAtHour": 8 }] } },
      "id": "b1f0c1d2-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
      "name": "Every day at 8:00",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.2,
      "position": [0, 0],
      "notes": "Starts the workflow every morning at 8:00.",
      "notesInFlow": true
    },
    {
      "parameters": {
        "resource": "sheet",
        "operation": "read",
        "documentId": { "__rl": true, "mode": "id", "value": "YOUR_SPREADSHEET_ID" },
        "sheetName": { "__rl": true, "mode": "name", "value": "Sales" }
      },
      "id": "c2a1d3e4-5f60-4b7a-9c8d-1e2f3a4b5c6d",
      "name": "Read sales sheet",
      "type": "n8n-nodes-base.googleSheets",
      "typeVersion": 4.5,
      "position": [260, 0],
      "notes": "Reads today's rows from the Sales sheet so they can be counted.",
      "notesInFlow": true
    },
    {
      "parameters": {
        "select": "channel",
        "channelId": { "__rl": true, "mode": "name", "value": "#sales" },
        "text": "=Rows today: {{ $input.all().length }}"
      },
      "id": "d3b2e4f5-6071-4c8b-8d9e-2f3a4b5c6d7e",
      "name": "Post summary to Slack",
      "type": "n8n-nodes-base.slack",
      "typeVersion": 2.3,
      "position": [520, 0],
      "notes": "Posts the daily total to #sales so the team sees it first thing.",
      "notesInFlow": true
    }
  ],
  "connections": {
    "Every day at 8:00": { "main": [[{ "node": "Read sales sheet", "type": "main", "index": 0 }]] },
    "Read sales sheet": { "main": [[{ "node": "Post summary to Slack", "type": "main", "index": 0 }]] }
  },
  "active": false,
  "settings": { "executionOrder": "v1" },
  "pinData": {},
  "meta": { "templateCredsSetupCompleted": true },
  "tags": []
}`;

export const SYSTEM_PROMPT = `You are an expert n8n workflow architect. You turn a plain-language description (in any language) into an n8n workflow JSON that can be imported as-is.

OUTPUT
Reply ONLY with one valid JSON object. No markdown, no \`\`\`, no explanations.
Exact structure:
{
  "name": string,
  "nodes": [ { "parameters": object, "id": string, "name": string, "type": string, "typeVersion": number, "position": [number, number], "notes": string, "notesInFlow": true } ],
  "connections": { "<source node name>": { "main": [ [ { "node": "<target node name>", "type": "main", "index": 0 } ] ] } },
  "active": false,
  "settings": { "executionOrder": "v1" },
  "pinData": {},
  "meta": { "templateCredsSetupCompleted": true },
  "tags": []
}

MANDATORY RULES
1. Use ONLY real node types from the catalog below. If nothing fits, use n8n-nodes-base.httpRequest.
2. "type" is the full identifier (e.g. n8n-nodes-base.gmail). "name" is free text, unique and descriptive.
3. Every node needs a unique "id" (UUID v4), a "position" [x, y] and "parameters" as an object. Do not repeat positions.
4. "connections" is keyed by the EXACT name of the source node. Each output is an array; branches (If/Switch) use separate arrays inside "main" (If: output 0 = true, output 1 = false).
5. Exactly one trigger node unless the user asks otherwise.
6. CHOOSING THE TRIGGER: anything time-based ("every morning at 8", "daily", "hourly", "every Monday", "cada mañana") MUST use n8n-nodes-base.scheduleTrigger, even if the data comes from Sheets, a database or an API — read that data in a later node. Use an app trigger (gmailTrigger, telegramTrigger, googleSheetsTrigger...) only when the workflow must react to a new event in that app ("when an email arrives", "when a row is added").
7. Each node's parameters must match its own type. Never put the parameters of one service (e.g. Gmail's sendTo/subject) inside another service's node (e.g. Slack).
8. Do NOT include a "credentials" field or any tokens: the user connects credentials later in n8n. Use placeholders such as "YOUR_FOLDER_ID" in parameters.
9. Use n8n expressions when needed: "={{ $json.field }}", "={{ $now.format('yyyy-MM-dd') }}". For literal text without an expression, do not prefix with "=".
10. At most 12 nodes. Prefer clear, linear workflows; avoid unnecessary nodes.
11. Parameters must really exist on the node. If you are unsure of a parameter's exact shape, simplify or use httpRequest.
12. The workflow must import as-is: valid JSON, no comments, no undefined values.
13. "name" is short (max 60 characters) and in the requested language.
14. In "connections" ALWAYS use the exact name of a node declared in "nodes". Never invent targets or suffixes like "Node!error": n8n does not recognize them.
15. Every node must be connected (unless it is the only one). For error handling use an If node that checks the output, or the node settings "onError": "continueErrorOutput" and "retryOnFail"; never connect to nodes that do not exist.
16. EVERY node MUST have "notes": one plain sentence (max 140 characters) explaining what that node does in THIS specific workflow and why — not what the node type does in general. Write it in the requested language, for a non-technical reader. Set "notesInFlow": true.

EXACT PARAMETER FORMATS (n8n 1.x/2.x — copy these shapes):
- Expressions: always "={{ ... }}". Webhook data is in $json.body. Read an earlier node with $('Node Name').item.json.field. Never write "=json.x" or "{{ }}" without the leading "=".
- n8n-nodes-base.set (v3.4): {"mode":"manual","assignments":{"assignments":[{"id":"<uuid>","name":"greeting","value":"={{ 'Hello ' + $json.body.name.toUpperCase() }}","type":"string"}]},"includeOtherFields":true,"options":{}}
- n8n-nodes-base.code (v2): {"jsCode":"<JavaScript>"} — the code must return an array of { json: {...} } items. Read webhook fields from $input.first().json.body.<field>, using the exact field names from the user's description; loop over arrays with reduce/map; use $input, never $node.
- n8n-nodes-base.webhook (v2): {"httpMethod":"POST","path":"orders","responseMode":"responseNode"} when the flow ends in Respond to Webhook (no leading slash in path).
- n8n-nodes-base.respondToWebhook (v1.1): {"respondWith":"json","responseBody":"={{ { id: $json.id } }}"} or {"respondWith":"firstIncomingItem"}.
- n8n-nodes-base.emailSend (v2.1): {"fromEmail":"you@example.com","toEmail":"={{ $json.email }}","subject":"Daily summary","emailFormat":"text","text":"={{ 'Total: ' + $json.total }}"} — addresses are plain strings.
- n8n-nodes-base.postgres (v2.5) with placeholders: {"operation":"executeQuery","query":"INSERT INTO orders (email, total) VALUES ($1, $2) RETURNING id","options":{"queryReplacement":"={{ [$json.body.email, $json.body.total] }}"}}
- To total or count rows use n8n-nodes-base.code (or aggregate), not set.

NODE CATALOG (type (version) — usage):
${NODE_CATALOG.map((n) => `- ${n.type} (v${n.version}) — ${n.hint}`).join("\n")}

EXAMPLE OF THE CORRECT SHAPE:
${FORMAT_EXAMPLE}`;

export function buildUserPrompt(description: string, options: GenerateOptions = {}): string {
  const language = options.nodeNamesLanguage === "es" ? "Spanish" : "English";
  const lines = [
    "Automation to build:",
    '"""',
    description.trim(),
    '"""',
    "",
    "Preferences:",
    `- Node names and the workflow name in ${language}.`,
    `- Every node needs "notes": one sentence in ${language} explaining its job in this workflow.`,
  ];

  if (options.triggerHint?.trim()) {
    lines.push(`- Preferred trigger type: ${options.triggerHint.trim()}.`);
  }
  if (options.includeErrorHandling) {
    lines.push(
      '- Add resilience: on nodes that call external services (HTTP, email, Slack, DB) include "retryOnFail": true, "maxTries": 3, "waitBetweenTries": 2000.',
    );
  }
  lines.push("", "Return only the workflow JSON.");
  return lines.join("\n");
}
