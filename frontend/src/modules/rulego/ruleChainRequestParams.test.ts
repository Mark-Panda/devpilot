import { describe, expect, it } from "vitest";
import {
  buildRuleChainParamsPreviewValue,
  importRuleChainParamsFromObjectJson,
  parseRuleChainParamsJson,
  parseRuleChainParamsJsonStrict,
  serializeRuleChainParamsNodes,
} from "./ruleChainRequestParams";

describe("ruleChainRequestParams", () => {
  it("round-trips nodes", () => {
    const json = `[{"key":"a","type":"number","required":true,"description":"n","children":[]}]`;
    const nodes = parseRuleChainParamsJson(json);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].key).toBe("a");
    expect(nodes[0].type).toBe("number");
    const out = serializeRuleChainParamsNodes(nodes);
    expect(JSON.parse(out)).toEqual([
      { key: "a", type: "number", required: true, description: "n", children: [] },
    ]);
  });

  it("imports object with inferred types", () => {
    const nodes = importRuleChainParamsFromObjectJson(
      JSON.stringify({ n: 3, ok: false, tags: [1, 2], cfg: { a: 1 } })
    );
    expect(nodes.find((r) => r.key === "n")?.type).toBe("number");
    expect(nodes.find((r) => r.key === "ok")?.type).toBe("boolean");
    expect(nodes.find((r) => r.key === "tags")?.type).toBe("array");
    const cfg = nodes.find((r) => r.key === "cfg");
    expect(cfg?.type).toBe("object");
    expect(cfg?.children?.[0]?.key).toBe("a");
  });

  it("builds preview object from nodes", () => {
    const json = JSON.stringify([
      { key: "cfg", type: "object", required: false, description: "nested", children: [{ key: "a", type: "number", required: false, description: "", children: [] }] },
    ]);
    const nodes = parseRuleChainParamsJson(json);
    const preview = buildRuleChainParamsPreviewValue(nodes);
    expect(preview).toEqual({ cfg: { a: 0 } });
  });

  it("rejects non-object import", () => {
    expect(() => importRuleChainParamsFromObjectJson("[]")).toThrow();
  });

  it("parseRuleChainParamsJsonStrict rejects non-array", () => {
    expect(() => parseRuleChainParamsJsonStrict("{}")).toThrow(/数组/);
  });

  it("parseRuleChainParamsJsonStrict rejects bad type", () => {
    expect(() =>
      parseRuleChainParamsJsonStrict('[{"key":"a","type":"oops","required":false,"description":"","children":[]}]')
    ).toThrow(/type/);
  });
});
