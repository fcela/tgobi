import { describe, it, expect } from "vitest";
import { agglomerative } from "../hierarchical";

describe("agglomerative", () => {
  it("returns empty result for empty data", () => {
    const r = agglomerative([], 2);
    expect(r.assignments.length).toBe(0);
  });

  it("clusters two well-separated blobs with complete linkage", () => {
    const data: (number | null)[][] = [];
    for (let i = 0; i < 5; i++) data.push([0, 0]);
    for (let i = 0; i < 5; i++) data.push([100, 100]);
    const r = agglomerative(data, 2, "complete");
    expect(r.k).toBe(2);
    const c0 = r.assignments[0]!;
    const c5 = r.assignments[5]!;
    expect(c0).not.toBe(c5);
    for (let i = 0; i < 5; i++) expect(r.assignments[i]).toBe(c0);
    for (let i = 5; i < 10; i++) expect(r.assignments[i]).toBe(c5);
  });

  it("clusters with single linkage", () => {
    const data: (number | null)[][] = [];
    for (let i = 0; i < 4; i++) data.push([0, 0]);
    for (let i = 0; i < 4; i++) data.push([100, 100]);
    const r = agglomerative(data, 2, "single");
    expect(r.k).toBe(2);
    expect(r.assignments[0]).not.toBe(r.assignments[4]);
  });

  it("clusters with average linkage", () => {
    const data: (number | null)[][] = [];
    for (let i = 0; i < 4; i++) data.push([0, 0]);
    for (let i = 0; i < 4; i++) data.push([100, 100]);
    const r = agglomerative(data, 2, "average");
    expect(r.k).toBe(2);
    expect(r.assignments[0]).not.toBe(r.assignments[4]);
  });

  it("handles missing values by assigning -1", () => {
    const data: (number | null)[][] = [
      [1, 2],
      [null, 2],
      [10, 10],
      [11, 11],
    ];
    const r = agglomerative(data, 2);
    expect(r.assignments[1]).toBe(-1);
    expect(r.assignments[0]).toBeGreaterThanOrEqual(0);
  });

  it("returns correct sizes", () => {
    const data: (number | null)[][] = [];
    for (let i = 0; i < 3; i++) data.push([0, 0]);
    for (let i = 0; i < 5; i++) data.push([100, 100]);
    const r = agglomerative(data, 2);
    expect(r.sizes.length).toBe(2);
    expect(r.sizes.reduce((a, b) => a + b, 0)).toBe(8);
  });

  it("handles k >= n by returning singleton clusters", () => {
    const data: (number | null)[][] = [[1], [2], [3]];
    const r = agglomerative(data, 5);
    expect(r.k).toBe(3);
    expect(r.assignments[0]).not.toBe(r.assignments[1]);
  });

  it("handles 1D data", () => {
    const data: (number | null)[][] = [
      [1], [2], [3], [100], [101], [102],
    ];
    const r = agglomerative(data, 2);
    expect(r.k).toBe(2);
    expect(r.assignments[0]).not.toBe(r.assignments[3]);
  });
});
