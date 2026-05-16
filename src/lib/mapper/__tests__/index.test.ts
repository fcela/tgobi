import { describe, it, expect } from "vitest";
import { computeMapper, DEFAULT_MAPPER_PARAMS } from "../index";
import type { MapperParams } from "../index";

function makeCol(name: string, values: number[]) {
  return {
    name,
    values: new Float64Array(values),
    missing: new Uint8Array(Math.ceil(values.length / 8)),
  };
}

describe("computeMapper", () => {
  it("returns empty graph for no valid rows", () => {
    const values = new Float64Array(5);
    const missing = new Uint8Array(1);
    missing[0] = 0b11111;
    const cols = [makeCol("x", [1, 2, 3, 4, 5])];
    const graph = computeMapper(values, missing, 5, cols, DEFAULT_MAPPER_PARAMS);
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
  });

  it("returns empty graph for constant filter values", () => {
    const values = new Float64Array(5).fill(3);
    const missing = new Uint8Array(1);
    const cols = [makeCol("x", [1, 2, 3, 4, 5])];
    const graph = computeMapper(values, missing, 5, cols, DEFAULT_MAPPER_PARAMS);
    expect(graph.nodes).toHaveLength(0);
  });

  it("produces nodes with stats including sd, min, max", () => {
    const values = new Float64Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const missing = new Uint8Array(2);
    const cols = [makeCol("x", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])];
    const params: MapperParams = { ...DEFAULT_MAPPER_PARAMS, intervals: 3, overlap: 0.3 };
    const graph = computeMapper(values, missing, 10, cols, params);
    expect(graph.nodes.length).toBeGreaterThan(0);
    for (const node of graph.nodes) {
      expect(node.stats["_count"]).toBeGreaterThan(0);
      expect(typeof node.stats["x"]).toBe("number");
      expect(typeof node.stats["_sd_x"]).toBe("number");
      expect(typeof node.stats["_min_x"]).toBe("number");
      expect(typeof node.stats["_max_x"]).toBe("number");
    }
  });

  it("creates edges between nodes sharing rows", () => {
    const values = new Float64Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const missing = new Uint8Array(2);
    const cols = [makeCol("x", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])];
    const params: MapperParams = { ...DEFAULT_MAPPER_PARAMS, intervals: 3, overlap: 0.5 };
    const graph = computeMapper(values, missing, 10, cols, params);
    if (graph.nodes.length > 1) {
      expect(graph.edges.length).toBeGreaterThan(0);
    }
  });

  it("respects intervals parameter", () => {
    const values = new Float64Array(Array.from({ length: 30 }, (_, i) => i));
    const missing = new Uint8Array(4);
    const cols = [makeCol("x", Array.from({ length: 30 }, (_, i) => i))];
    const params5: MapperParams = { ...DEFAULT_MAPPER_PARAMS, intervals: 5, overlap: 0.3 };
    const graph5 = computeMapper(values, missing, 30, cols, params5);
    const params10: MapperParams = { ...DEFAULT_MAPPER_PARAMS, intervals: 10, overlap: 0.3 };
    const graph10 = computeMapper(values, missing, 30, cols, params10);
    expect(graph10.nodes.length).toBeGreaterThanOrEqual(graph5.nodes.length);
  });

  it("stores nClusters per interval", () => {
    const values = new Float64Array(Array.from({ length: 20 }, (_, i) => i));
    const missing = new Uint8Array(3);
    const cols = [makeCol("x", Array.from({ length: 20 }, (_, i) => i))];
    const params: MapperParams = { ...DEFAULT_MAPPER_PARAMS, intervals: 4, overlap: 0.3, clusterK: 2 };
    const graph = computeMapper(values, missing, 20, cols, params);
    expect(graph.nClusters).toHaveLength(4);
    const totalClusters = graph.nClusters.reduce((s, c) => s + c, 0);
    expect(totalClusters).toBe(graph.nodes.length);
  });
});

describe("computeMapper overlap", () => {
  it("higher overlap produces more edges", () => {
    const values = new Float64Array(Array.from({ length: 50 }, (_, i) => i));
    const missing = new Uint8Array(7);
    const cols = [
      makeCol("x", Array.from({ length: 50 }, (_, i) => Math.sin(i))),
      makeCol("y", Array.from({ length: 50 }, (_, i) => Math.cos(i))),
    ];
    const lowOverlap: MapperParams = { ...DEFAULT_MAPPER_PARAMS, intervals: 5, overlap: 0.1 };
    const highOverlap: MapperParams = { ...DEFAULT_MAPPER_PARAMS, intervals: 5, overlap: 0.8 };
    const graphLow = computeMapper(values, missing, 50, cols, lowOverlap);
    const graphHigh = computeMapper(values, missing, 50, cols, highOverlap);
    expect(graphHigh.edges.length).toBeGreaterThanOrEqual(graphLow.edges.length);
  });
});
