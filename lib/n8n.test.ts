import { describe, expect, it } from "vitest";
import { extractJson, normalizeWorkflow, slugifyFileName } from "./n8n";

describe("extractJson", () => {
  it("parses a plain JSON object", () => {
    expect(extractJson('{"name":"x"}')).toEqual({ name: "x" });
  });

  it("unwraps ```json fences", () => {
    const text = 'Aquí tienes el flujo:\n```json\n{"name":"Facturas","nodes":[]}\n```\nListo.';
    expect(extractJson(text)).toEqual({ name: "Facturas", nodes: [] });
  });

  it("trims text around the object", () => {
    const text = 'Claro. {"name":"Demo"} Espero que sirva.';
    expect(extractJson(text)).toEqual({ name: "Demo" });
  });

  it("repairs trailing commas", () => {
    const text = '{"name":"Demo","nodes":[{"name":"A",},],}';
    expect(extractJson(text)).toEqual({ name: "Demo", nodes: [{ name: "A" }] });
  });

  it("returns null when there is no JSON", () => {
    expect(extractJson("no hay nada aquí")).toBeNull();
    expect(extractJson("")).toBeNull();
  });
});

describe("normalizeWorkflow", () => {
  const raw = {
    name: "  Prueba  ",
    nodes: [
      {
        name: "Gmail Trigger",
        type: "gmailTrigger",
        typeVersion: 1.1,
        position: [0, 0],
        credentials: { gmailOAuth2: { id: "1", name: "Correo" } },
        parameters: { pollTimes: { item: [{ mode: "everyMinute" }] } },
      },
      {
        name: "Avisar",
        type: "slack",
        position: [0, 0],
        parameters: { channel: "#finanzas" },
      },
      {
        name: "Avisar",
        type: "Slack",
        position: [0, 0],
        parameters: {},
      },
    ],
    connections: {
      "Gmail Trigger": {
        main: [
          [
            { node: "Avisar", type: "main", index: 0 },
            { node: "Fantasma", type: "main", index: 0 },
          ],
        ],
      },
    },
  };

  it("normalizes types, names, credentials and connections", () => {
    const { workflow, issues } = normalizeWorkflow(raw);

    expect(workflow.name).toBe("Prueba");
    expect(workflow.active).toBe(false);
    expect(workflow.settings.executionOrder).toBe("v1");
    expect(workflow.meta.templateCredsSetupCompleted).toBe(true);
    expect(workflow.pinData).toEqual({});

    expect(workflow.nodes.map((n) => n.type)).toEqual([
      "n8n-nodes-base.gmailTrigger",
      "n8n-nodes-base.slack",
      "n8n-nodes-base.slack",
    ]);
    expect(workflow.nodes.map((n) => n.name)).toEqual(["Gmail Trigger", "Avisar", "Avisar 2"]);

    for (const node of workflow.nodes) {
      expect("credentials" in node).toBe(false);
      expect(typeof node.id).toBe("string");
      expect(node.id.length).toBeGreaterThan(0);
    }
    expect(new Set(workflow.nodes.map((n) => n.id)).size).toBe(3);

    const targets = workflow.connections["Gmail Trigger"].main[0];
    expect(targets).toHaveLength(1);
    expect(targets[0].node).toBe("Avisar");

    expect(issues.some((i) => i.severity === "warning" && i.message.includes("Fantasma"))).toBe(true);
    expect(issues.some((i) => i.message.includes("credentials"))).toBe(true);
    expect(issues.some((i) => i.message.includes("Duplicate") || i.message.includes("renamed"))).toBe(true);
  });

  it("computes unique positions when missing or repeated", () => {
    const { workflow } = normalizeWorkflow(raw);
    const positions = workflow.nodes.map((n) => `${n.position[0]},${n.position[1]}`);
    expect(new Set(positions).size).toBe(3);
  });

  it("chains the nodes when there are no connections", () => {
    const { workflow, issues, stats } = normalizeWorkflow({
      name: "Sin conexiones",
      nodes: [
        { name: "A", type: "n8n-nodes-base.webhook", position: [0, 0] },
        { name: "B", type: "n8n-nodes-base.set", position: [0, 0] },
        { name: "C", type: "n8n-nodes-base.slack", position: [0, 0] },
      ],
    });

    expect(workflow.connections["A"].main[0][0].node).toBe("B");
    expect(workflow.connections["B"].main[0][0].node).toBe("C");
    expect(stats.connections).toBe(2);
    expect(issues.some((i) => i.message.includes("chained"))).toBe(true);
  });

  it("warns about orphan nodes, even at the end", () => {
    const { issues } = normalizeWorkflow({
      nodes: [
        { name: "A", type: "n8n-nodes-base.webhook", position: [0, 0] },
        { name: "B", type: "n8n-nodes-base.set", position: [320, 0] },
        { name: "Suelto", type: "n8n-nodes-base.slack", position: [0, 200] },
      ],
      connections: { A: { main: [[{ node: "B", type: "main", index: 0 }]] } },
    });

    expect(issues.some((i) => i.severity === "warning" && i.message.includes("Suelto"))).toBe(true);
    expect(issues.some((i) => i.message.includes('"B" has no incoming'))).toBe(false);
  });

  it("accepts the { workflow: { ... } } shape", () => {
    const { workflow } = normalizeWorkflow({ workflow: { name: "Envuelto", nodes: raw.nodes } });
    expect(workflow.name).toBe("Envuelto");
    expect(workflow.nodes).toHaveLength(3);
  });

  it("rejects invalid input", () => {
    expect(() => normalizeWorkflow(null)).toThrow();
    expect(() => normalizeWorkflow({ nodes: [] })).toThrow();
    expect(() => normalizeWorkflow({ nodes: [{ name: "x" }] })).not.toThrow();
  });
});

describe("slugifyFileName", () => {
  it("turns the name into a safe file name", () => {
    expect(slugifyFileName("Facturas a Drive y Slack")).toBe("facturas-a-drive-y-slack.json");
    expect(slugifyFileName("Automatización de facturas")).toBe("automatizacion-de-facturas.json");
  });

  it("falls back to a default name", () => {
    expect(slugifyFileName("")).toBe("workflow-n8n.json");
    expect(slugifyFileName("!!!")).toBe("workflow-n8n.json");
  });
});

describe("node notes", () => {
  it("keeps a short explanation per node and shows it in n8n", () => {
    const { workflow, issues } = normalizeWorkflow({
      nodes: [
        { name: "A", type: "n8n-nodes-base.webhook", parameters: {}, notes: "  Receives the   contact form. " },
        { name: "B", type: "n8n-nodes-base.slack", parameters: {}, notes: 42 },
      ],
      connections: { A: { main: [[{ node: "B", type: "main", index: 0 }]] } },
    });
    expect(workflow.nodes[0].notes).toBe("Receives the contact form.");
    expect(workflow.nodes[0].notesInFlow).toBe(true);
    expect(workflow.nodes[1].notes).toBeUndefined();
    expect(issues.some((i) => i.message.includes("without an explanation"))).toBe(true);
  });
});

describe("isBadlyDamaged", () => {
  it("flags answers where a third of the nodes are broken", async () => {
    const { isBadlyDamaged } = await import("./n8n");
    const broken = normalizeWorkflow({
      nodes: [
        { name: "A", type: "n8n-nodes-base.webhook", parameters: {} },
        { name: "B", parameters: {} },
        42,
      ],
      connections: { A: { main: [[{ node: "B", type: "main", index: 0 }]] } },
    });
    expect(isBadlyDamaged(broken)).toBe(true);
    const fine = normalizeWorkflow({
      nodes: [
        { name: "A", type: "n8n-nodes-base.webhook", parameters: {} },
        { name: "B", type: "n8n-nodes-base.slack", parameters: {} },
      ],
      connections: { A: { main: [[{ node: "B", type: "main", index: 0 }]] } },
    });
    expect(isBadlyDamaged(fine)).toBe(false);
  });
});

describe("repairExpression", () => {
  it("fixes the expression mistakes seen in real runs", async () => {
    const { repairExpression } = await import("./repair");
    expect(repairExpression("=json.body.name")).toBe("={{ $json.body.name }}");
    expect(repairExpression("{{ $json.total }}")).toBe("={{ $json.total }}");
    expect(repairExpression("=={{ $json.a }}")).toBe("={{ $json.a }}");
    expect(repairExpression("= {{ $json.a }}")).toBe("={{ $json.a }}");
    expect(repairExpression("=new Date().toISOString()")).toBe("={{ new Date().toISOString() }}");
    expect(repairExpression("=Total for today")).toBe("=Total for today");
    expect(repairExpression("plain text")).toBe("plain text");
  });
});
