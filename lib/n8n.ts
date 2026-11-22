import { isTriggerType, resolveNodeSpec } from "./nodes";
import { repairNodes } from "./repair";

export interface N8nConnectionTarget {
  node: string;
  type: "main";
  index: number;
}

export interface N8nNode {
  parameters: Record<string, unknown>;
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  disabled?: boolean;
  notes?: string;
  notesInFlow?: boolean;
  onError?: string;
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
  alwaysOutputData?: boolean;
  executeOnce?: boolean;
  webhookId?: string;
}

export interface N8nWorkflow {
  name: string;
  nodes: N8nNode[];
  connections: Record<string, { main: N8nConnectionTarget[][] }>;
  active: false;
  settings: { executionOrder: "v1"; [key: string]: unknown };
  pinData: Record<string, unknown>;
  meta: Record<string, unknown>;
  tags: unknown[];
}

export type IssueSeverity = "error" | "warning" | "info";

export interface WorkflowIssue {
  severity: IssueSeverity;
  message: string;
}

export interface NormalizeResult {
  workflow: N8nWorkflow;
  issues: WorkflowIssue[];
  stats: { nodes: number; connections: number; triggers: number };
  /** How much of the model's answer had to be thrown away or patched. */
  damage: { dropped: number; untyped: number; badLinks: number; received: number };
}

const NODE_KEYS = [
  "parameters",
  "id",
  "name",
  "type",
  "typeVersion",
  "position",
  "disabled",
  "notes",
  "notesInFlow",
  "onError",
  "retryOnFail",
  "maxTries",
  "waitBetweenTries",
  "alwaysOutputData",
  "executeOnce",
  "webhookId",
] as const;

const LAYER_GAP = 320;
const ROW_GAP = 170;

function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Extracts the first valid JSON object from a text (handles ```json ... ``` fences). */
export function extractJson(text: string): unknown | null {
  if (!text || typeof text !== "string") return null;
  let candidate = text.trim();

  const fenced = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidate = fenced[1].trim();

  const start = candidate.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;

  for (let i = start; i < candidate.length; i += 1) {
    const ch = candidate[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  const slice = end === -1 ? candidate.slice(start) : candidate.slice(start, end + 1);

  try {
    return JSON.parse(slice);
  } catch {
    /* intenta reparaciones conservadoras */
  }
  const repaired = slice.replace(/,\s*([}\]])/g, "$1");
  try {
    return JSON.parse(repaired);
  } catch {
    return null;
  }
}

function coerceParameters(value: unknown, issues: WorkflowIssue[]): Record<string, unknown> {
  if (isPlainObject(value)) return value;
  if (typeof value === "string" && value.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(value);
      if (isPlainObject(parsed)) {
        issues.push({ severity: "info", message: "A serialized parameter was converted to an object." });
        return parsed;
      }
    } catch {
      /* ignora */
    }
  }
  return {};
}

function sanitizePosition(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const x = Number(value[0]);
  const y = Number(value[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [Math.round(x), Math.round(y)];
}

function layout(nodes: N8nNode[], connections: N8nWorkflow["connections"]): void {
  const order = new Map(nodes.map((n, i) => [n.name, i]));
  const levels = new Map<string, number>(nodes.map((n) => [n.name, 0]));
  const adjacency = new Map<string, string[]>(nodes.map((n) => [n.name, []]));

  for (const [source, conn] of Object.entries(connections)) {
    const outs = conn.main.flat().map((t) => t.node);
    adjacency.set(source, outs.filter((t) => order.has(t)));
  }

  for (let pass = 0; pass < nodes.length + 1; pass += 1) {
    let changed = false;
    for (const [source, targets] of adjacency) {
      const base = levels.get(source) ?? 0;
      for (const target of targets) {
        if ((levels.get(target) ?? 0) < base + 1) {
          levels.set(target, base + 1);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  const rows = new Map<number, number>();
  const sorted = [...nodes].sort((a, b) => (order.get(a.name) ?? 0) - (order.get(b.name) ?? 0));
  for (const node of sorted) {
    const level = levels.get(node.name) ?? 0;
    const row = rows.get(level) ?? 0;
    rows.set(level, row + 1);
    node.position = [level * LAYER_GAP, row * ROW_GAP];
  }
}

function resolveCanonicalName(
  name: string,
  byName: Map<string, string>,
  byLower: Map<string, string>,
): string | undefined {
  return byName.get(name) ?? byLower.get(name.trim().toLowerCase());
}

/**
 * Turns the model's (possibly imperfect) output into an importable n8n workflow:
 * ids, node types, unique names, valid connections and layout.
 */
export interface NormalizeContext {
  /** The user's original description, used for sanity checks on the model's choices. */
  description?: string;
}

const SCHEDULE_HINT =
  /\b(every|each|daily|weekly|monthly|hourly|cron|schedule|at \d{1,2}(:\d{2})?\s*(am|pm)?|cada|todos los d[ií]as|diari[oa]|semanal|mensual|a las \d)/i;

export function normalizeWorkflow(input: unknown, context: NormalizeContext = {}): NormalizeResult {
  const issues: WorkflowIssue[] = [];
  const raw = isPlainObject(input) && isPlainObject(input.workflow) ? input.workflow : input;

  if (!isPlainObject(raw)) {
    throw new Error("La respuesta no contiene un objeto de workflow.");
  }

  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  if (rawNodes.length === 0) {
    throw new Error("El workflow no contiene nodos.");
  }

  const usedNames = new Set<string>();
  const usedIds = new Set<string>();
  const nodes: N8nNode[] = [];
  let strippedCredentials = 0;
  const damage = { dropped: 0, untyped: 0, badLinks: 0, received: 0 };

  damage.received = rawNodes.length;
  rawNodes.forEach((candidate, index) => {
    if (!isPlainObject(candidate)) {
      damage.dropped += 1;
      issues.push({ severity: "warning", message: `Dropped an invalid node at position ${index}.` });
      return;
    }

    const rawType = typeof candidate.type === "string" ? candidate.type.trim() : "";
    const spec = resolveNodeSpec(rawType);
    let type = rawType;
    if (spec) {
      if (spec.type !== rawType) {
        issues.push({
          severity: "info",
          message: `Tipo de nodo "${rawType}" resuelto como "${spec.type}".`,
        });
      }
      type = spec.type;
    } else if (!rawType) {
      type = "n8n-nodes-base.noOp";
      damage.untyped += 1;
      issues.push({ severity: "warning", message: `Node #${index + 1} had no type; used No Operation.` });
    } else {
      issues.push({
        severity: "warning",
        message: `Node type "${rawType}" is not in the catalog; check that it exists in your n8n instance.`,
      });
    }

    if (isPlainObject(candidate.credentials) || candidate.credentials != null) {
      strippedCredentials += 1;
    }

    let name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    if (!name) name = spec?.label ?? `Node ${index + 1}`;
    let unique = name;
    let suffix = 2;
    while (usedNames.has(unique)) {
      unique = `${name} ${suffix}`;
      suffix += 1;
    }
    if (unique !== name) {
      issues.push({ severity: "info", message: `Duplicate name "${name}" renamed to "${unique}".` });
    }
    usedNames.add(unique);

    let id = typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.trim() : newId();
    while (usedIds.has(id)) id = newId();
    usedIds.add(id);

    const node: N8nNode = {
      parameters: coerceParameters(candidate.parameters, issues),
      id,
      name: unique,
      type,
      typeVersion:
        typeof candidate.typeVersion === "number" && candidate.typeVersion > 0
          ? candidate.typeVersion
          : (spec?.version ?? 1),
      position: sanitizePosition(candidate.position) ?? [0, 0],
    };

    for (const key of NODE_KEYS) {
      if (key === "parameters" || key === "id" || key === "name" || key === "type") continue;
      if (key === "typeVersion" || key === "position") continue;
      if (key === "notes" || key === "notesInFlow") continue;
      const value = candidate[key];
      if (value === undefined) continue;
      (node as unknown as Record<string, unknown>)[key] = value;
    }

    const notes = typeof candidate.notes === "string" ? candidate.notes.replace(/\s+/g, " ").trim().slice(0, 300) : "";
    if (notes) {
      node.notes = notes;
      node.notesInFlow = true;
    }

    nodes.push(node);
  });

  if (strippedCredentials > 0) {
    issues.push({
      severity: "warning",
      message: `Removed credentials from ${strippedCredentials} node(s): connect them inside n8n.`,
    });
  }

  if (nodes.length === 0) throw new Error("None of the workflow nodes were valid.");

  const byName = new Map(nodes.map((n) => [n.name, n.name]));
  const byLower = new Map(nodes.map((n) => [n.name.toLowerCase(), n.name]));
  const rawConnections = isPlainObject(raw.connections) ? raw.connections : {};
  const connections: N8nWorkflow["connections"] = {};
  const seenEdges = new Set<string>();

  for (const [rawSource, rawConn] of Object.entries(rawConnections)) {
    const source = resolveCanonicalName(rawSource, byName, byLower);
    if (!source) {
      damage.badLinks += 1;
      issues.push({
        severity: "warning",
        message: `Ignored a connection from "${rawSource}": that node does not exist.`,
      });
      continue;
    }
    if (source !== rawSource) {
      issues.push({ severity: "info", message: `Origen "${rawSource}" ajustado a "${source}".` });
    }

    const mainRaw = isPlainObject(rawConn) && Array.isArray(rawConn.main) ? rawConn.main : null;
    if (!mainRaw) {
      issues.push({ severity: "warning", message: `Node "${source}" has no valid outputs.` });
      continue;
    }

    const outputs: N8nConnectionTarget[][] = mainRaw.map((output, outputIndex) => {
      if (!Array.isArray(output)) return [];
      const targets: N8nConnectionTarget[] = [];
      for (const item of output) {
        if (!isPlainObject(item) || typeof item.node !== "string") continue;
        const target = resolveCanonicalName(item.node, byName, byLower);
        if (!target) {
          damage.badLinks += 1;
          issues.push({
            severity: "warning",
            message: `Ignored target "${item.node}" in "${source}": that node does not exist.`,
          });
          continue;
        }
        const key = `${source}|${outputIndex}|${target}`;
        if (seenEdges.has(key)) continue;
        seenEdges.add(key);
        targets.push({
          node: target,
          type: "main",
          index: Number.isInteger(item.index) && (item.index as number) >= 0 ? (item.index as number) : 0,
        });
      }
      return targets;
    });

    if (outputs.some((o) => o.length > 0) || mainRaw.length > 0) {
      connections[source] = { main: outputs };
    }
  }

  const hasIncoming = new Set<string>();
  for (const conn of Object.values(connections)) {
    for (const output of conn.main) {
      for (const target of output) hasIncoming.add(target.node);
    }
  }

  for (const node of nodes) {
    const hasOutgoing = (connections[node.name]?.main.flat().length ?? 0) > 0;
    if (!hasOutgoing && !hasIncoming.has(node.name) && nodes.length > 1) {
      issues.push({
        severity: "warning",
        message: `Node "${node.name}" has no incoming or outgoing connection.`,
      });
    }
  }

  const edgeCountBeforeChain = Object.values(connections).reduce(
    (sum, conn) => sum + conn.main.flat().length,
    0,
  );

  if (edgeCountBeforeChain === 0 && nodes.length > 1) {
    for (let i = 0; i < nodes.length - 1; i += 1) {
      connections[nodes[i].name] = {
        main: [[{ node: nodes[i + 1].name, type: "main", index: 0 }]],
      };
    }
    issues.push({
      severity: "warning",
      message: "The model returned no connections; nodes were chained in the order received. Review it.",
    });
  }

  repairNodes(nodes, issues);

  const edgeCount = Object.values(connections).reduce(
    (sum, conn) => sum + conn.main.flat().length,
    0,
  );

  const positionedNodes = nodes.filter((n) => n.position[0] !== 0 || n.position[1] !== 0);
  const allSamePosition =
    nodes.length > 1 && new Set(nodes.map((n) => `${n.position[0]},${n.position[1]}`)).size === 1;
  if (positionedNodes.length < nodes.length || allSamePosition) {
    layout(nodes, connections);
    issues.push({ severity: "info", message: "Node positions were laid out automatically." });
  }

  const undescribed = nodes.filter((n) => !n.notes).length;
  if (undescribed > 0 && nodes.length > 1) {
    issues.push({
      severity: "info",
      message: `${undescribed} node(s) came without an explanation from the model; hover shows only their type.`,
    });
  }

    const triggers = nodes.filter((n) => isTriggerType(n.type)).length;
  if (triggers === 0 && nodes.length > 1) {
    issues.push({
      severity: "warning",
      message: "No trigger node found: the workflow will only run manually.",
    });
  } else if (
    context.description &&
    SCHEDULE_HINT.test(context.description) &&
    !nodes.some((n) => /scheduleTrigger|cron$/i.test(n.type)) &&
    !/\b(when|whenever|as soon as|receives?|cuando|apenas|al recibir|llegue)\b/i.test(context.description)
  ) {
    issues.push({
      severity: "warning",
      message:
        "The description sounds time-based, but the workflow has no Schedule Trigger. Consider replacing the trigger with n8n-nodes-base.scheduleTrigger.",
    });
  }
  if (triggers > 1) {
    issues.push({ severity: "info", message: `Found ${triggers} triggers.` });
  }

  const name =
    typeof raw.name === "string" && raw.name.trim()
      ? raw.name.trim().slice(0, 120)
      : "Generated workflow";

  const settings = isPlainObject(raw.settings) ? raw.settings : {};

  const workflow: N8nWorkflow = {
    name,
    nodes,
    connections,
    active: false,
    settings: { ...settings, executionOrder: "v1" },
    pinData: isPlainObject(raw.pinData) ? raw.pinData : {},
    meta: { ...(isPlainObject(raw.meta) ? raw.meta : {}), templateCredsSetupCompleted: true },
    tags: Array.isArray(raw.tags) ? raw.tags : [],
  };

  return {
    workflow,
    issues,
    stats: { nodes: nodes.length, connections: edgeCount, triggers },
    damage,
  };
}

export function slugifyFileName(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "workflow-n8n"}.json`;
}

/**
 * True when so much of the model's answer was broken that showing it would be misleading:
 * a third or more of the nodes dropped/untyped, or most connections pointing nowhere.
 */
export function isBadlyDamaged(result: NormalizeResult): boolean {
  const { dropped, untyped, badLinks, received } = result.damage;
  if (received === 0) return true;
  const brokenNodes = (dropped + untyped) / received;
  const links = result.stats.connections + badLinks;
  return brokenNodes >= 1 / 3 || (links > 0 && badLinks / links > 0.5);
}

/** A short list of what went wrong, to send back to the model for a repair. */
export function damageSummary(result: NormalizeResult): string {
  return result.issues
    .filter((i) => i.severity !== "info")
    .slice(0, 12)
    .map((i) => `- ${i.message}`)
    .join("\n");
}
