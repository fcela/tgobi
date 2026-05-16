import { describe, it, expect } from "vitest";
import { silhouette } from "@/lib/clustering/silhouette";
import type { ClusterResult } from "@/lib/clustering/types";

describe("silhouette", () => {
  it("returns zero mean for a single cluster", () => {
    const data = [[0], [1], [2]];
    const result: ClusterResult = {
      assignments: new Int16Array([0, 0, 0]),
      k: 1,
      sizes: [3],
    };
    const sil = silhouette(data, result);
    expect(sil.mean).toBe(0);
  });

  it("returns high silhouette for well-separated clusters", () => {
    const data: number[][] = [];
    for (let i = 0; i < 10; i++) data.push([0, 0]);
    for (let i = 0; i < 10; i++) data.push([100, 100]);
    const assignments = new Int16Array(20);
    for (let i = 0; i < 10; i++) assignments[i] = 0;
    for (let i = 10; i < 20; i++) assignments[i] = 1;
    const result: ClusterResult = { assignments, k: 2, sizes: [10, 10] };
    const sil = silhouette(data, result);
    expect(sil.mean).toBeGreaterThan(0.9);
    expect(sil.perCluster).toHaveLength(2);
  });

  it("returns negative silhouette for misassigned points", () => {
    const data: number[][] = [[0, 0], [100, 100], [0.1, 0.1]];
    const assignments = new Int16Array([0, 0, 1]);
    const result: ClusterResult = { assignments, k: 2, sizes: [2, 1] };
    const sil = silhouette(data, result);
    expect(sil.scores[1]).toBeLessThan(0);
  });

  it("handles noise points (assignment -1)", () => {
    const data: number[][] = [[0, 0], [100, 100], [50, 50]];
    const assignments = new Int16Array([0, 1, -1]);
    const result: ClusterResult = { assignments, k: 2, sizes: [1, 1] };
    const sil = silhouette(data, result);
    expect(sil.scores[2]).toBe(0);
  });

  it("handles empty data", () => {
    const result: ClusterResult = { assignments: new Int16Array(0), k: 0, sizes: [] };
    const sil = silhouette([], result);
    expect(sil.mean).toBe(0);
  });
});
