import { describe, expect, it } from "vitest";
import { isTriggerType, resolveNodeSpec } from "./nodes";

describe("isTriggerType", () => {
  it("recognizes catalog triggers", () => {
    expect(isTriggerType("n8n-nodes-base.webhook")).toBe(true);
    expect(isTriggerType("n8n-nodes-base.scheduleTrigger")).toBe(true);
    expect(isTriggerType("webhook")).toBe(true);
  });

  it("does not mistake actions with 'webhook' in the name", () => {
    expect(isTriggerType("n8n-nodes-base.respondToWebhook")).toBe(false);
    expect(isTriggerType("n8n-nodes-base.httpRequest")).toBe(false);
    expect(isTriggerType("respondToWebhook")).toBe(false);
  });
});

describe("resolveNodeSpec", () => {
  it("resolves full type, short name and alias", () => {
    expect(resolveNodeSpec("n8n-nodes-base.gmail")?.type).toBe("n8n-nodes-base.gmail");
    expect(resolveNodeSpec("gmail")?.type).toBe("n8n-nodes-base.gmail");
    expect(resolveNodeSpec("Google Drive")?.label).toBe("Google Drive");
    expect(resolveNodeSpec("function")?.type).toBe("n8n-nodes-base.code");
  });
});
