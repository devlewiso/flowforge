// Smoke test against a REAL n8n: generate workflows with FlowForge, import them into a local n8n (Docker) and run them.
// Only credential-free cases (webhook, schedule, HTTP to public APIs, code), so nothing touches your accounts.
//
//   FLOWFORGE_URL=http://127.0.0.1:3050 N8N_CONTAINER=n8n npx tsx scripts/n8n-smoke.mts [provider] [model]
//
// Webhook/schedule triggers can't be started from the n8n CLI, so each workflow runs through a harness:
// Manual Trigger → a Code node that emits the sample request (named like the original trigger) → the generated nodes.
// Respond to Webhook nodes are swapped for No-Op (they need a live HTTP request). Imported workflows are inactive and
// prefixed "[FlowForge smoke]"; delete them from n8n when done.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.FLOWFORGE_URL ?? "http://127.0.0.1:3050";
const CONTAINER = process.env.N8N_CONTAINER ?? "n8n";
const provider = process.argv[2] ?? "ollama";
const model = process.argv[3];

const CASES: { name: string; prompt: string; sample: unknown; expect: (out: string) => boolean }[] = [
  {
    name: "greeting",
    prompt:
      "When a webhook receives a POST with a JSON body containing a name, build a greeting like Hello NAME in uppercase together with the current date, and respond to the webhook with that greeting as JSON.",
    sample: { body: { name: "Ada" } },
    expect: (o) => /HELLO ADA|Hello ADA/i.test(o) && /ADA/.test(o),
  },
  {
    name: "order-total",
    prompt:
      "When a webhook receives an order with a list of items (each with price and quantity), calculate the order total and respond with the total as JSON.",
    sample: { body: { items: [{ price: 10, quantity: 2 }, { price: 5.5, quantity: 4 }] } },
    expect: (o) => /\b42(\.0+)?\b/.test(o),
  },
  {
    name: "github-stars",
    prompt:
      "Every hour, get the repository https://api.github.com/repos/n8n-io/n8n with an HTTP request and keep only the repository name, the number of stars and the number of open issues.",
    sample: {},
    expect: (o) => /stargazers_count|stars/i.test(o) && /n8n/.test(o),
  },
];

const dir = mkdtempSync(join(tmpdir(), "ff-smoke-"));
const results: { name: string; generated: boolean; ran: boolean; ok: boolean; note: string }[] = [];

for (const [i, c] of CASES.entries()) {
  const res = await fetch(`${BASE}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ prompt: c.prompt, provider, model }),
  });
  const data = (await res.json()) as { workflow?: { nodes: any[]; connections: Record<string, any> }; error?: string };
  if (!data.workflow) {
    results.push({ name: c.name, generated: false, ran: false, ok: false, note: data.error ?? `HTTP ${res.status}` });
    continue;
  }
  const wf = structuredClone(data.workflow);
  const trigger = wf.nodes.find((n) => /webhook$|scheduleTrigger$|formTrigger$|cron$/i.test(n.type));
  if (trigger) {
    trigger.type = "n8n-nodes-base.code";
    trigger.typeVersion = 2;
    trigger.parameters = { jsCode: `return [{ json: ${JSON.stringify(c.sample)} }];` };
  }
  for (const n of wf.nodes) {
    if (/respondToWebhook$/i.test(n.type)) {
      n.type = "n8n-nodes-base.noOp";
      n.typeVersion = 1;
      n.parameters = {};
    }
  }
  wf.nodes.unshift({ id: "smoke-manual", name: "Smoke start", type: "n8n-nodes-base.manualTrigger", typeVersion: 1, position: [-400, 0], parameters: {} });
  if (trigger) wf.connections["Smoke start"] = { main: [[{ node: trigger.name, type: "main", index: 0 }]] };
  const id = `ffsmoke${String(Date.now()).slice(-6)}${i}`;
  const file = join(dir, `${c.name}.json`);
  writeFileSync(file, JSON.stringify({ ...wf, id, name: `[FlowForge smoke] ${c.name}`, active: false }));

  let out = "";
  try {
    execFileSync("docker", ["cp", file, `${CONTAINER}:/tmp/${c.name}.json`]);
    execFileSync("docker", ["exec", CONTAINER, "n8n", "import:workflow", `--input=/tmp/${c.name}.json`], { stdio: "pipe" });
    out = execFileSync("docker", ["exec", "-e", "N8N_RUNNERS_BROKER_PORT=5699", CONTAINER, "n8n", "execute", `--id=${id}`, "--rawOutput"], {
      encoding: "utf8",
      stdio: "pipe",
      timeout: 120_000,
    });
  } catch (e: any) {
    out = String(e.stdout ?? "") + String(e.stderr ?? "");
  }
  const status = out.match(/"status":\s*"(\w+)"/g)?.pop() ?? "";
  const error = out.match(/"message":\s*"([^"]{0,160})/)?.[1] ?? "";
  const ok = /success/.test(status) && c.expect(out);
  results.push({ name: c.name, generated: true, ran: /success/.test(status), ok, note: ok ? "output as expected" : error || status || "no output" });
}

console.table(results);
console.log(`files: ${dir}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
