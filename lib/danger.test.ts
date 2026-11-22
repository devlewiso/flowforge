import { describe, expect, it } from "vitest";
import { normalizeWorkflow } from "./n8n";
import { findDangerousNodes, findPublicPathsToDanger } from "./danger";

const rce = {
  nodes: [
    { name: "Hook", type: "n8n-nodes-base.webhook", parameters: { path: "run" } },
    { name: "Run", type: "n8n-nodes-base.executeCommand", parameters: { command: "={{ $json.body.cmd }}" } },
  ],
  connections: { Hook: { main: [[{ node: "Run", type: "main", index: 0 }]] } },
};

describe("dangerous nodes", () => {
  it("flags executeCommand behind an open webhook", () => {
    const { workflow } = normalizeWorkflow(rce);
    const findings = findDangerousNodes(workflow);
    expect(findings.map((f) => f.node)).toEqual(["Run"]);
    expect(findPublicPathsToDanger(workflow, findings)).toEqual(["Hook → Run"]);
  });

  it("does not count a webhook with authentication as public", () => {
    const authed = structuredClone(rce);
    (authed.nodes[0].parameters as Record<string, unknown>).authentication = "headerAuth";
    const { workflow } = normalizeWorkflow(authed);
    expect(findPublicPathsToDanger(workflow, findDangerousNodes(workflow))).toEqual([]);
  });

  it("flags code nodes that reach the OS, not ordinary code", () => {
    const wf = (jsCode: string) =>
      normalizeWorkflow({ nodes: [{ name: "C", type: "n8n-nodes-base.code", parameters: { jsCode } }] }).workflow;
    expect(findDangerousNodes(wf("const cp = require('child_process'); return [];"))).toHaveLength(1);
    expect(findDangerousNodes(wf("return $input.all().map(i => ({ json: { total: i.json.a + 1 } }));"))).toHaveLength(0);
  });
});
