import type { N8nNode, N8nWorkflow } from "./n8n";

/**
 * Review checklist for a generated workflow.
 *
 * A workflow can look clean and still write to the wrong field or run on a
 * credential the wrong team owns. Every node here was chosen by the model, so
 * the checklist points at what a person has to confirm before activating it,
 * and the review log records which nodes were approved as generated and which
 * ones a person changed.
 */

export type ReviewCheckKind = "credential" | "write" | "target";

export interface ReviewCheck {
  kind: ReviewCheckKind;
  message: string;
}

export interface ReviewItem {
  node: string;
  type: string;
  checks: ReviewCheck[];
}

export type ReviewDecision = "pending" | "approved" | "changed";

/** Core nodes that never need a credential. */
const NO_CREDENTIAL =
  /\.(set|if|switch|merge|code|function|functionitem|noop|wait|splitinbatches|splitout|aggregate|filter|sort|limit|datetime|crypto|scheduletrigger|manualtrigger|webhook|formtrigger|form|respondtowebhook|errortrigger|executeworkflow|executeworkflowtrigger|stickynote|html|xml|markdown|itemlists|removeduplicates|summarize|comparedatasets|renamekeys|converttofile|extractfromfile|start|httprequest|chattrigger|agent|chainllm|chainsummarization|outputparserstructured|memorybufferwindow|toolcode|toolworkflow)$/;

const WRITE_OPERATIONS =
  /^(create|append|appendorupdate|update|upsert|insert|delete|deleteall|remove|send|sendmessage|sendandwait|reply|post|postmessage|upload|move|copy|share|set|incr|publish|push|executequery|executecommand|edit|archive|close)$/i;

const WRITE_METHODS = /^(post|put|patch|delete)$/i;

/** Parameters that decide where data goes or comes from. */
const TARGET_KEYS = new Set([
  "url",
  "path",
  "documentId",
  "sheetName",
  "range",
  "folderId",
  "driveId",
  "databaseId",
  "pageId",
  "base",
  "table",
  "schema",
  "collection",
  "channelId",
  "channel",
  "chatId",
  "sendTo",
  "toEmail",
  "fromEmail",
  "owner",
  "repository",
  "project",
  "key",
]);

/** Parameters that map incoming fields onto the destination. */
const MAPPING_KEYS = new Set(["columns", "fieldsUi", "assignments", "properties", "fields", "dataToSend", "jsonBody", "bodyParameters", "query"]);

function lastSegment(type: string): string {
  return type.toLowerCase().split(".").pop() ?? "";
}

function needsCredential(node: N8nNode): boolean {
  const type = node.type.toLowerCase();
  if (type.endsWith(".httprequest")) {
    const auth = node.parameters.authentication;
    return typeof auth === "string" && auth !== "none";
  }
  return !NO_CREDENTIAL.test(`.${lastSegment(type)}`);
}

function writeAction(node: N8nNode): string | null {
  const type = lastSegment(node.type);
  if (type.endsWith("trigger")) return null;
  const { operation, method, requestMethod } = node.parameters;
  for (const value of [operation, method, requestMethod]) {
    if (typeof value !== "string") continue;
    if (WRITE_OPERATIONS.test(value) || WRITE_METHODS.test(value)) return value;
  }
  if (type === "emailsend") return "send";
  return null;
}

function presentKeys(parameters: Record<string, unknown>, keys: Set<string>): string[] {
  return Object.keys(parameters).filter((key) => keys.has(key) && parameters[key] !== "" && parameters[key] != null);
}

export function buildReview(workflow: N8nWorkflow): ReviewItem[] {
  return workflow.nodes.map((node) => {
    const checks: ReviewCheck[] = [];
    if (needsCredential(node)) {
      checks.push({
        kind: "credential",
        message: "Connect a credential your team owns. FlowForge strips any credential the model suggested.",
      });
    }
    const write = writeAction(node);
    const targets = presentKeys(node.parameters, TARGET_KEYS);
    const mappings = presentKeys(node.parameters, MAPPING_KEYS);
    if (write) {
      checks.push({
        kind: "write",
        message: `Writes data (${write}). Run it once on test data before activating.`,
      });
    }
    if (targets.length > 0 || (write && mappings.length > 0)) {
      const keys = [...targets, ...(write ? mappings : [])];
      checks.push({
        kind: "target",
        message: `Check where it points and which fields it maps: ${keys.join(", ")}.`,
      });
    }
    return { node: node.name, type: node.type, checks };
  });
}

export interface ReviewLog {
  format: "flowforge-review/1";
  workflow: string;
  generatedBy: { provider: string; model: string };
  reviewedAt: string;
  summary: { nodes: number; needSignOff: number; approved: number; changedByPerson: number; pending: number };
  nodes: Array<{
    node: string;
    type: string;
    origin: "model";
    decision: ReviewDecision;
    checks: ReviewCheck[];
  }>;
}

/** Audit trail of the review: what the model chose and what a person approved or changed. */
export function buildReviewLog(
  workflow: N8nWorkflow,
  items: ReviewItem[],
  decisions: Record<string, ReviewDecision>,
  generatedBy: { provider: string; model: string },
  now: Date = new Date(),
): ReviewLog {
  const nodes = items.map((item) => ({
    node: item.node,
    type: item.type,
    origin: "model" as const,
    decision: decisions[item.node] ?? "pending",
    checks: item.checks,
  }));
  return {
    format: "flowforge-review/1",
    workflow: workflow.name,
    generatedBy,
    reviewedAt: now.toISOString(),
    summary: {
      nodes: nodes.length,
      needSignOff: nodes.filter((n) => n.checks.length > 0).length,
      approved: nodes.filter((n) => n.decision === "approved").length,
      changedByPerson: nodes.filter((n) => n.decision === "changed").length,
      pending: nodes.filter((n) => n.decision === "pending").length,
    },
    nodes,
  };
}
