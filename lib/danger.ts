import type { N8nWorkflow } from "./n8n";

export interface DangerFinding {
  node: string;
  type: string;
  reason: string;
}

/** Nodes that can run commands, touch the server's files or control n8n itself. */
const DANGEROUS_TYPES: Record<string, string> = {
  "n8n-nodes-base.executecommand": "runs shell commands on the n8n server",
  "n8n-nodes-base.ssh": "runs commands on remote machines over SSH",
  "n8n-nodes-base.readwritefile": "reads and writes files on the n8n server",
  "n8n-nodes-base.readbinaryfile": "reads files on the n8n server",
  "n8n-nodes-base.readbinaryfiles": "reads files on the n8n server",
  "n8n-nodes-base.writebinaryfile": "writes files on the n8n server",
  "n8n-nodes-base.n8n": "changes workflows and credentials through the n8n API",
};

/** Code that escapes the sandbox or reaches the host. */
const DANGEROUS_CODE =
  /child_process|require\s*\(|process\.(env|exit|binding|mainModule)|\bexecSync\b|\bspawn\s*\(|\beval\s*\(|new\s+Function\s*\(|import\s*\(|\bfs\.|__import__|\bsubprocess\b|\bos\.(system|popen)/i;

const PUBLIC_TRIGGERS = /(\.webhook|\.formtrigger|chattrigger)$/i;

function codeOf(parameters: Record<string, unknown>): string {
  return ["jsCode", "pythonCode", "code", "functionCode"]
    .map((k) => (typeof parameters[k] === "string" ? (parameters[k] as string) : ""))
    .join("\n");
}

export function findDangerousNodes(workflow: N8nWorkflow): DangerFinding[] {
  const findings: DangerFinding[] = [];
  for (const node of workflow.nodes) {
    const type = node.type.toLowerCase();
    const reason = DANGEROUS_TYPES[type];
    if (reason) findings.push({ node: node.name, type: node.type, reason });
    else if (/\.(code|function|functionitem)$/.test(type) && DANGEROUS_CODE.test(codeOf(node.parameters))) {
      findings.push({ node: node.name, type: node.type, reason: "its code reaches the operating system or files" });
    }
  }
  return findings;
}

/**
 * A public trigger (webhook/form/chat) without authentication that can reach a
 * dangerous node means anyone on the internet could drive it.
 */
export function findPublicPathsToDanger(workflow: N8nWorkflow, findings: DangerFinding[]): string[] {
  if (findings.length === 0) return [];
  const dangerous = new Set(findings.map((f) => f.node));
  const result: string[] = [];
  for (const trigger of workflow.nodes) {
    if (!PUBLIC_TRIGGERS.test(trigger.type)) continue;
    const auth = trigger.parameters.authentication;
    if (typeof auth === "string" && auth !== "none") continue;
    const seen = new Set<string>([trigger.name]);
    const queue = [trigger.name];
    while (queue.length) {
      const current = queue.shift()!;
      for (const output of workflow.connections[current]?.main ?? []) {
        for (const target of output) {
          if (seen.has(target.node)) continue;
          seen.add(target.node);
          queue.push(target.node);
          if (dangerous.has(target.node)) result.push(`${trigger.name} → ${target.node}`);
        }
      }
    }
  }
  return result;
}
