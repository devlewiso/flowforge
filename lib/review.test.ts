import { describe, expect, it } from "vitest";
import type { N8nNode, N8nWorkflow } from "./n8n";
import { buildReview, buildReviewLog } from "./review";

function node(name: string, type: string, parameters: Record<string, unknown> = {}): N8nNode {
  return { name, type, parameters, id: name, typeVersion: 1, position: [0, 0] };
}

function workflow(nodes: N8nNode[]): N8nWorkflow {
  return { name: "Test", nodes, connections: {}, active: false, settings: { executionOrder: "v1" }, pinData: {}, meta: {}, tags: [] };
}

describe("buildReview", () => {
  it("flags credential, write and target on a Sheets append", () => {
    const [item] = buildReview(
      workflow([
        node("Save row", "n8n-nodes-base.googleSheets", { operation: "append", documentId: "abc", sheetName: "Sales", columns: {} }),
      ]),
    );
    expect(item.checks.map((c) => c.kind)).toEqual(["credential", "write", "target"]);
    expect(item.checks[2].message).toContain("documentId");
    expect(item.checks[2].message).toContain("columns");
  });

  it("leaves pure logic nodes without checks", () => {
    const items = buildReview(workflow([node("If", "n8n-nodes-base.if"), node("Fields", "n8n-nodes-base.set", { assignments: {} })]));
    expect(items.every((i) => i.checks.length === 0)).toBe(true);
  });

  it("treats HTTP POST as a write and only asks for a credential when auth is set", () => {
    const [open, authed] = buildReview(
      workflow([
        node("Call", "n8n-nodes-base.httpRequest", { method: "POST", url: "https://x" }),
        node("Call auth", "n8n-nodes-base.httpRequest", { method: "GET", url: "https://x", authentication: "genericCredentialType" }),
      ]),
    );
    expect(open.checks.map((c) => c.kind)).toEqual(["write", "target"]);
    expect(authed.checks.map((c) => c.kind)).toEqual(["credential", "target"]);
  });

  it("does not call a trigger a write", () => {
    const [item] = buildReview(workflow([node("Gmail in", "n8n-nodes-base.gmailTrigger", { operation: "send" })]));
    expect(item.checks.map((c) => c.kind)).toEqual(["credential"]);
  });
});

describe("buildReviewLog", () => {
  it("records origin and the person's decisions", () => {
    const wf = workflow([node("Slack", "n8n-nodes-base.slack", { operation: "post", channelId: "C1" }), node("If", "n8n-nodes-base.if")]);
    const log = buildReviewLog(wf, buildReview(wf), { Slack: "changed" }, { provider: "OpenAI", model: "gpt" }, new Date(0));
    expect(log.nodes[0]).toMatchObject({ node: "Slack", origin: "model", decision: "changed" });
    expect(log.nodes[1].decision).toBe("pending");
    expect(log.summary).toEqual({ nodes: 2, needSignOff: 1, approved: 0, changedByPerson: 1, pending: 1 });
    expect(log.reviewedAt).toBe("1970-01-01T00:00:00.000Z");
  });
});
