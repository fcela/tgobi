import { describe, it, expect } from "vitest";
import { mapperSweep } from "../sweep";

function makeCol(name: string, values: number[]) {
  return {
    name,
    values: new Float64Array(values),
    missing: new Uint8Array(Math.ceil(values.length / 8)),
  };
}

describe("mapperSweep", () => {
  it("returns results for all interval/overlap combos", () => {
    const values = new Float64Array(Array.from({ length: 50 }, (_, i) => i));
    const missing = new Uint8Array(7);
    const cols = [
      makeCol("x", Array.from({ length: 50 }, (_, i) => Math.sin(i * 0.3))),
      makeCol("y", Array.from({ length: 50 }, (_, i) => Math.cos(i * 0.3))),
    ];
    const params = { filter: "variable" as const, filterVar: null, intervals: 10, overlap: 0.5, clusterK: 3, variables: ["x", "y"] };
    const intRange = [5, 10];
    const ovlRange = [0.3, 0.5];
    const results = mapperSweep(values, missing, 50, cols, params, intRange, ovlRange);
    expect(results).toHaveLength(4);
    for (const r of results) {
      expect(r.nNodes).toBeGreaterThanOrEqual(0);
      expect(r.nEdges).toBeGreaterThanOrEqual(0);
      expect(r.nComponents).toBeGreaterThanOrEqual(0);
      expect(r.avgDegree).toBeGreaterThanOrEqual(0);
      expect(r.modularity).toBeGreaterThanOrEqual(0);
      expect(r.modularity).toBeLessThanOrEqual(1);
    }
  });

  it("more overlap produces fewer or equal components", () => {
    const values = new Float64Array(Array.from({ length: 60 }, (_, i) => i));
    const missing = new Uint8Array(8);
    const cols = [
      makeCol("x", Array.from({ length: 60 }, (_, i) => Math.sin(i * 0.2))),
      makeCol("y", Array.from({ length: 60 }, (_, i) => Math.cos(i * 0.2))),
    ];
    const params = { filter: "variable" as const, filterVar: null, intervals: 10, overlap: 0.5, clusterK: 3, variables: ["x", "y"] };
    const results = mapperSweep(values, missing, 60, cols, params, [8], [0.1, 0.8]);
    const lowOverlap = results.find((r) => r.overlap === 0.1);
    const highOverlap = results.find((r) => r.overlap === 0.8);
    if (lowOverlap && highOverlap) {
      expect(highOverlap.nComponents).toBeLessThanOrEqual(lowOverlap.nComponents);
    }
  });

  it("more intervals produces more or equal nodes", () => {
    const values = new Float64Array(Array.from({ length: 80 }, (_, i) => i));
    const missing = new Uint8Array(10);
    const cols = [
      makeCol("x", Array.from({ length: 80 }, (_, i) => Math.sin(i * 0.15))),
      makeCol("y", Array.from({ length: 80 }, (_, i) => Math.cos(i * 0.15))),
    ];
    const params = { filter: "variable" as const, filterVar: null, intervals: 10, overlap: 0.5, clusterK: 3, variables: ["x", "y"] };
    const results = mapperSweep(values, missing, 80, cols, params, [5, 15], [0.3]);
    const lowInt = results.find((r) => r.intervals === 5);
    const highInt = results.find((r) => r.intervals === 15);
    if (lowInt && highInt) {
      expect(highInt.nNodes).toBeGreaterThanOrEqual(lowInt.nNodes);
    }
  });
});
