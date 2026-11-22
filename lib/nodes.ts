export type NodeGroup = "trigger" | "action" | "logic" | "data" | "ai";

export interface NodeSpec {
  type: string;
  label: string;
  group: NodeGroup;
  version: number;
  hint: string;
}

/**
 * Curated catalog of core n8n nodes. Not exhaustive: it makes the model pick real
 * types (instead of inventing them) and resolves short names ("gmail", "slack")
 * when normalizing the answer.
 */
export const NODE_CATALOG: NodeSpec[] = [
  // Triggers
  { type: "n8n-nodes-base.scheduleTrigger", label: "Schedule Trigger", group: "trigger", version: 1.2, hint: "USE FOR ANY TIME-BASED RUN (every day at 8, hourly, weekly); parameters.rule.interval: [{ field: \"days\"|\"hours\"|\"weeks\"|\"cronExpression\", triggerAtHour, expression }]" },
  { type: "n8n-nodes-base.webhook", label: "Webhook", group: "trigger", version: 2, hint: "httpMethod, path, responseMode" },
  { type: "n8n-nodes-base.formTrigger", label: "Form Trigger", group: "trigger", version: 2.2, hint: "formTitle, formFields" },
  { type: "n8n-nodes-base.manualTrigger", label: "Manual Trigger", group: "trigger", version: 1, hint: "run by hand" },
  { type: "n8n-nodes-base.errorTrigger", label: "Error Trigger", group: "trigger", version: 1, hint: "error workflow" },
  { type: "n8n-nodes-base.gmailTrigger", label: "Gmail Trigger", group: "trigger", version: 1.2, hint: "new email arrives; polls every minute; filters in parameters.filters" },
  { type: "n8n-nodes-base.emailReadImap", label: "Email (IMAP)", group: "trigger", version: 2.1, hint: "new email in an IMAP mailbox" },
  { type: "n8n-nodes-base.telegramTrigger", label: "Telegram Trigger", group: "trigger", version: 1.1, hint: "new Telegram message; updates: [\"message\"]" },
  { type: "n8n-nodes-base.slackTrigger", label: "Slack Trigger", group: "trigger", version: 1, hint: "Slack events" },
  { type: "n8n-nodes-base.googleSheetsTrigger", label: "Google Sheets Trigger", group: "trigger", version: 1.1, hint: "ONLY when rows are added/updated in a sheet (not for schedules)" },
  { type: "n8n-nodes-base.githubTrigger", label: "GitHub Trigger", group: "trigger", version: 1.1, hint: "repository events" },
  { type: "n8n-nodes-base.stripeTrigger", label: "Stripe Trigger", group: "trigger", version: 1, hint: "payment events" },
  { type: "n8n-nodes-base.airtableTrigger", label: "Airtable Trigger", group: "trigger", version: 1, hint: "new records" },
  { type: "n8n-nodes-base.notionTrigger", label: "Notion Trigger", group: "trigger", version: 1, hint: "new pages or databases" },

  // Actions / integrations
  { type: "n8n-nodes-base.httpRequest", label: "HTTP Request", group: "action", version: 4.2, hint: "method, url, sendBody, jsonBody, authentication" },
  { type: "n8n-nodes-base.gmail", label: "Gmail", group: "action", version: 2.1, hint: "resource: message; operation: send/get; sendTo, subject, message" },
  { type: "n8n-nodes-base.slack", label: "Slack", group: "action", version: 2.3, hint: "resource: message; operation: post; channelId, text or blocks" },
  { type: "n8n-nodes-base.googleSheets", label: "Google Sheets", group: "action", version: 4.5, hint: "resource: sheet; operation: append/read/update; range via documentId+sheetName" },
  { type: "n8n-nodes-base.googleDrive", label: "Google Drive", group: "action", version: 3, hint: "resource: file; operation: upload/update/download; inputDataFieldName, folderId" },
  { type: "n8n-nodes-base.telegram", label: "Telegram", group: "action", version: 1.2, hint: "resource: message; operation: sendMessage; chatId, text" },
  { type: "n8n-nodes-base.emailSend", label: "Send Email (SMTP)", group: "action", version: 2.1, hint: "fromEmail, toEmail, subject, html/text" },
  { type: "n8n-nodes-base.discord", label: "Discord", group: "action", version: 2, hint: "resource: message; operation: send; channelId, content" },
  { type: "n8n-nodes-base.notion", label: "Notion", group: "action", version: 2.2, hint: "resource: databasePage; operation: create; databaseId, properties" },
  { type: "n8n-nodes-base.airtable", label: "Airtable", group: "action", version: 2.1, hint: "operation: append/list; base/app/table ids" },
  { type: "n8n-nodes-base.postgres", label: "Postgres", group: "data", version: 2.5, hint: "operation: executeQuery/insert/update; query or schema+table" },
  { type: "n8n-nodes-base.mySql", label: "MySQL", group: "data", version: 2.4, hint: "operation: executeQuery/insert/update" },
  { type: "n8n-nodes-base.mongoDb", label: "MongoDB", group: "data", version: 1.2, hint: "operation: insert/find/update; collection" },
  { type: "n8n-nodes-base.redis", label: "Redis", group: "data", version: 1, hint: "operation: set/get/publish" },
  { type: "n8n-nodes-base.github", label: "GitHub", group: "action", version: 1.1, hint: "resource: issue/repository/file; operation" },
  { type: "n8n-nodes-base.jira", label: "Jira", group: "action", version: 1, hint: "resource: issue; operation: create/update" },
  { type: "n8n-nodes-base.hubspot", label: "HubSpot", group: "action", version: 2.1, hint: "resource: contact/deal; operation" },
  { type: "n8n-nodes-base.stripe", label: "Stripe", group: "action", version: 1, hint: "resource: charge/customer; operation" },
  { type: "n8n-nodes-base.ftp", label: "FTP", group: "action", version: 1, hint: "operation: upload/download/list" },
  { type: "n8n-nodes-base.graphql", label: "GraphQL", group: "action", version: 1.1, hint: "endpoint, query, variables" },
  { type: "n8n-nodes-base.respondToWebhook", label: "Respond to Webhook", group: "action", version: 1.1, hint: "respondWith, responseBody" },

  // Logic and transformation
  { type: "n8n-nodes-base.set", label: "Edit Fields", group: "logic", version: 3.4, hint: "assignments (fields) with type/value; manual mode" },
  { type: "n8n-nodes-base.if", label: "If", group: "logic", version: 2.2, hint: "conditions with leftValue/rightValue/operator; 2 outputs (true/false)" },
  { type: "n8n-nodes-base.switch", label: "Switch", group: "logic", version: 3.2, hint: "rules/rules.values; several outputs + fallback" },
  { type: "n8n-nodes-base.merge", label: "Merge", group: "logic", version: 3, hint: "mode append/combine; numberInputs" },
  { type: "n8n-nodes-base.code", label: "Code", group: "logic", version: 2, hint: "jsCode returning items (use $input.all())" },
  { type: "n8n-nodes-base.filter", label: "Filter", group: "logic", version: 2.2, hint: "conditions and combinator" },
  { type: "n8n-nodes-base.wait", label: "Wait", group: "logic", version: 1.1, hint: "amount + unit, or resume: webhook" },
  { type: "n8n-nodes-base.splitInBatches", label: "Loop Over Items", group: "logic", version: 3, hint: "batchSize; done and loop outputs" },
  { type: "n8n-nodes-base.sort", label: "Sort", group: "logic", version: 1, hint: "sortFields, type" },
  { type: "n8n-nodes-base.limit", label: "Limit", group: "logic", version: 1, hint: "maxItems, keep" },
  { type: "n8n-nodes-base.removeDuplicates", label: "Remove Duplicates", group: "logic", version: 2, hint: "compare: selectedFields/allFields" },
  { type: "n8n-nodes-base.aggregate", label: "Aggregate", group: "logic", version: 1, hint: "aggregate: aggregateAllItemData/specificField" },
  { type: "n8n-nodes-base.itemLists", label: "Item Lists", group: "logic", version: 3.1, hint: "splitOut/concatenate/summarize" },
  { type: "n8n-nodes-base.noOp", label: "No Operation", group: "logic", version: 1, hint: "junction / placeholder" },
  { type: "n8n-nodes-base.stopAndError", label: "Stop and Error", group: "logic", version: 1, hint: "errorMessage" },
  { type: "n8n-nodes-base.executeWorkflow", label: "Execute Workflow", group: "logic", version: 1.2, hint: "source: database; workflowId" },
  { type: "n8n-nodes-base.dateTime", label: "Date & Time", group: "logic", version: 2, hint: "operation: format/parse; value, format" },
  { type: "n8n-nodes-base.crypto", label: "Crypto", group: "logic", version: 1, hint: "action: hash/hmac; value, type" },
  { type: "n8n-nodes-base.html", label: "HTML", group: "logic", version: 1.2, hint: "operation: extractHtmlContent/generateHtml" },
  { type: "n8n-nodes-base.xml", label: "XML", group: "logic", version: 1, hint: "mode: jsonToXml/xmlToJson" },
  { type: "n8n-nodes-base.markdown", label: "Markdown", group: "logic", version: 1, hint: "mode: markdownToHtml" },
  { type: "n8n-nodes-base.spreadsheetFile", label: "Spreadsheet File", group: "data", version: 1.2, hint: "operation: fromJson/toJson/xlsx" },
  { type: "n8n-nodes-base.readWriteFile", label: "Read/Write File", group: "data", version: 1.1, hint: "operation: read/write; fileName, dataPropertyName" },
  { type: "n8n-nodes-base.convertToFile", label: "Convert to File", group: "data", version: 1.1, hint: "operation: toJson/toText/toXlsx; options" },

  // AI
  { type: "@n8n/n8n-nodes-langchain.openAi", label: "OpenAI (LangChain)", group: "ai", version: 1.8, hint: "resource: text; operation: message; modelId, messages" },
  { type: "@n8n/n8n-nodes-langchain.agent", label: "AI Agent", group: "ai", version: 1.7, hint: "promptType, text; needs a model connected via ai_languageModel" },
];

export const NODE_BY_TYPE = new Map<string, NodeSpec>(
  NODE_CATALOG.map((n) => [n.type.toLowerCase(), n]),
);

function normalizeAlias(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const ALIASES = new Map<string, NodeSpec>();
for (const spec of NODE_CATALOG) {
  ALIASES.set(normalizeAlias(spec.type), spec);
  ALIASES.set(normalizeAlias(spec.type.split(".").pop() ?? spec.type), spec);
  ALIASES.set(normalizeAlias(spec.label), spec);
}
ALIASES.set(normalizeAlias("editfields"), NODE_BY_TYPE.get("n8n-nodes-base.set")!);
ALIASES.set(normalizeAlias("editfields(set)"), NODE_BY_TYPE.get("n8n-nodes-base.set")!);
ALIASES.set(normalizeAlias("function"), NODE_BY_TYPE.get("n8n-nodes-base.code")!);
ALIASES.set(normalizeAlias("loopoveritems"), NODE_BY_TYPE.get("n8n-nodes-base.splitInBatches")!);
for (const alias of ["n8n-nodes-base.email", "email", "sendemail", "smtp", "n8n-nodes-base.smtp"]) {
  ALIASES.set(normalizeAlias(alias), NODE_BY_TYPE.get("n8n-nodes-base.emailsend")!);
}

/** Resuelve un tipo exacto o un alias corto ("gmail", "Google Drive"). */
export function resolveNodeSpec(type: string): NodeSpec | undefined {
  if (!type) return undefined;
  const clean = type.trim();
  return NODE_BY_TYPE.get(clean.toLowerCase()) ?? ALIASES.get(normalizeAlias(clean));
}

export const GROUP_META: Record<
  NodeGroup,
  { label: string; color: string; glyph: string }
> = {
  trigger: { label: "Trigger", color: "#f59e0b", glyph: "⚡" },
  action: { label: "Action", color: "#ff5a3c", glyph: "▶" },
  logic: { label: "Logic", color: "#a78bfa", glyph: "◇" },
  data: { label: "Data", color: "#38bdf8", glyph: "▤" },
  ai: { label: "AI", color: "#34d399", glyph: "✦" },
};

export function groupForType(type: string): NodeGroup {
  const spec = resolveNodeSpec(type);
  if (spec) return spec.group;
  if (/trigger|webhook/i.test(type)) return "trigger";
  if (/langchain/i.test(type)) return "ai";
  if (/sql|mongo|redis|sheet|file|spreadsheet/i.test(type)) return "data";
  if (/\.(if|switch|merge|filter|code|set|wait|sort|limit)$/i.test(type)) return "logic";
  return "action";
}

export function nodeTypeLabel(type: string): string {
  const spec = resolveNodeSpec(type);
  if (spec) return spec.label;
  const short = type.split(".").pop() ?? type;
  return short.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function isTriggerType(type: string): boolean {
  const spec = resolveNodeSpec(type);
  if (spec) return spec.group === "trigger";
  return /trigger/i.test(type) || /(^|\.)webhook$/i.test(type);
}
