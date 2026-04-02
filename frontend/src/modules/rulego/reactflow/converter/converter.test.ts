import { describe, it, expect } from "vitest";
import { dslToReactFlow } from "./dslToReactFlow";
import { reactFlowToDsl } from "./reactFlowToDsl";
import type { RuleGoDsl } from "./types";

// vitest 环境没有 BlockTypeDef registry（需要 side-effect import），
// 使用 mock 模拟 getBlockTypeFromNodeType / getNodeType
vi.mock("../../rulego-blocks", () => ({
  getBlockTypeFromNodeType: (nodeType: string) => `rulego_${nodeType}`,
  getNodeType: (blockType: string) => blockType.replace("rulego_", ""),
}));

import { vi } from "vitest";

const linearDsl: RuleGoDsl = {
  metadata: {
    nodes: [
      { id: "s1", type: "startTrigger", name: "开始", configuration: {} },
      { id: "s2", type: "jsTransform", name: "转换", configuration: { jsScript: "return msg;" } },
      { id: "s3", type: "restApiCall", name: "调用", configuration: { restEndpointUrlPattern: "https://x.com" } },
    ],
    connections: [
      { fromId: "s1", toId: "s2", type: "Success" },
      { fromId: "s2", toId: "s3", type: "Success" },
    ],
  },
};

describe("dslToReactFlow", () => {
  it("线性链：节点和边 1:1 映射", () => {
    const { nodes, edges } = dslToReactFlow(linearDsl);
    expect(nodes).toHaveLength(3);
    expect(edges).toHaveLength(2);
    expect(nodes[0].id).toBe("s1");
    expect(edges[0].source).toBe("s1");
    expect(edges[0].target).toBe("s2");
    expect(edges[0].label).toBe("Success");
  });

  it("join 多入边：保留所有入边", () => {
    const dsl: RuleGoDsl = {
      metadata: {
        nodes: [
          { id: "a", type: "jsTransform", name: "A", configuration: {} },
          { id: "b", type: "jsTransform", name: "B", configuration: {} },
          { id: "c", type: "jsTransform", name: "C", configuration: {} },
          { id: "join1", type: "join", name: "汇聚", configuration: {} },
        ],
        connections: [
          { fromId: "a", toId: "join1", type: "Success" },
          { fromId: "b", toId: "join1", type: "Success" },
          { fromId: "c", toId: "join1", type: "Success" },
        ],
      },
    };
    const { nodes, edges } = dslToReactFlow(dsl);
    expect(nodes).toHaveLength(4);
    // join 有 3 条入边
    const joinEdges = edges.filter((e) => e.target === "join1");
    expect(joinEdges).toHaveLength(3);
  });

  it("有向环：回边正常映射", () => {
    const dsl: RuleGoDsl = {
      metadata: {
        nodes: [
          { id: "a", type: "jsFilter", name: "A", configuration: {} },
          { id: "b", type: "jsTransform", name: "B", configuration: {} },
        ],
        connections: [
          { fromId: "a", toId: "b", type: "True" },
          { fromId: "b", toId: "a", type: "Success" }, // 回边
        ],
      },
    };
    const { nodes, edges } = dslToReactFlow(dsl);
    expect(nodes).toHaveLength(2);
    expect(edges).toHaveLength(2);
    // 回边存在
    const backEdge = edges.find((e) => e.source === "b" && e.target === "a");
    expect(backEdge).toBeDefined();
  });
});

describe("reactFlowToDsl（往返一致性）", () => {
  it("线性链往返", () => {
    const { nodes, edges } = dslToReactFlow(linearDsl);
    const restored = reactFlowToDsl(nodes, edges);
    expect(restored.nodes).toHaveLength(3);
    expect(restored.connections).toHaveLength(2);
    expect(restored.connections[0].fromId).toBe("s1");
    expect(restored.connections[0].type).toBe("Success");
  });

  it("配置字段往返不损失", () => {
    const { nodes, edges } = dslToReactFlow(linearDsl);
    const restored = reactFlowToDsl(nodes, edges);
    const s3 = restored.nodes.find((n) => n.id === "s3");
    expect(s3?.configuration?.restEndpointUrlPattern).toBe("https://x.com");
  });
});
