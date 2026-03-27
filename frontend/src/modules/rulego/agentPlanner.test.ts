import { describe, expect, it } from "vitest";
import { applyAgentSelectionsToDsl, buildAgentPreviewItems, type AgentPlanResult } from "./agentPlanner";

describe("agentPlanner", () => {
  it("filters unsupported node types in preview", () => {
    const plan: AgentPlanResult = {
      nodes: [{ id: "n1", node_type: "startTrigger" }, { id: "n2", node_type: "unknown/type" }],
      edges: [],
    };
    const items = buildAgentPreviewItems(plan, new Set(["startTrigger"]));
    expect(items[0].valid).toBe(true);
    expect(items[1].valid).toBe(false);
  });

  it("merges selected nodes and edges to current dsl", () => {
    const dsl = JSON.stringify({
      ruleChain: { name: "demo" },
      metadata: { nodes: [{ id: "start", type: "startTrigger", name: "开始", configuration: {} }], connections: [] },
    });
    const plan: AgentPlanResult = {
      nodes: [{ id: "llm_1", node_type: "ai/llm", name: "LLM", configuration: { model: "x" } }],
      edges: [{ from_id: "start", to_id: "llm_1", type: "Success" }],
    };
    const preview = buildAgentPreviewItems(plan, new Set(["ai/llm", "startTrigger"]));
    const result = applyAgentSelectionsToDsl(
      dsl,
      preview,
      new Set(preview.map((item) => item.id))
    ) as { metadata: { nodes: Array<{ id: string }>; connections: Array<{ toId: string }> } };
    expect(result.metadata.nodes.some((n) => n.id === "llm_1")).toBe(true);
    expect(result.metadata.connections.some((c) => c.toId === "llm_1")).toBe(true);
  });
});
