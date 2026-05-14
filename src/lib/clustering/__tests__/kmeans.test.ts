import { describe, it, expect } from "vitest";
import { kMeans } from "../kmeans";

describe("kMeans", () => {
  it("returns empty result for empty data", () => {
    const r = kMeans([], 3);
    expect(r.assignments.length).toBe(0);
    expect(r.k).toBe(0);
  });

  it("clusters two well-separated blobs", () => {
    const data: (number | null)[][] = [];
    for (let i = 0; i < 20; i++) data.push([0 + Math.random() * 0.1, 0 + Math.random() * 0.1]);
    for (let i = 0; i < 20; i++) data.push([10 + Math.random() * 0.1, 10 + Math.random() * 0.1]);
    const r = kMeans(data, 2, { seed: 1 });
    expect(r.k).toBe(2);
    const c0 = r.assignments[0]!;
    const c20 = r.assignments[20]!;
    expect(c0).not.toBe(c20);
    for (let i = 0; i < 20; i++) expect(r.assignments[i]).toBe(c0);
    for (let i = 20; i < 40; i++) expect(r.assignments[i]).toBe(c20);
  });

  it("handles missing values by assigning -1", () => {
    const data: (number | null)[][] = [
      [1, 2],
      [null, 2],
      [1, null],
      [10, 10],
    ];
    const r = kMeans(data, 2);
    expect(r.assignments[1]).toBe(-1);
    expect(r.assignments[2]).toBe(-1);
    expect(r.assignments[0]).toBeGreaterThanOrEqual(0);
    expect(r.assignments[3]).toBeGreaterThanOrEqual(0);
  });

  it("respects maxIter option", () => {
    const data = Array.from({ length: 10 }, (_, i) => [i] as (number | null)[]);
    const r = kMeans(data, 2, { maxIter: 1 });
    expect(r.k).toBe(2);
    expect(r.assignments.length).toBe(10);
  });

  it("returns correct sizes", () => {
    const data: (number | null)[][] = [
      [0, 0], [0, 0], [0, 0],
      [10, 10], [10, 10],
    ];
    const r = kMeans(data, 2, { seed: 1 });
    const sum = r.sizes.reduce((a, b) => a + b, 0);
    expect(sum).toBe(5);
    expect(r.sizes.length).toBe(2);
  });

  it("handles k > n by only assigning available rows", () => {
    const data: (number | null)[][] = [[1], [2]];
    const r = kMeans(data, 5);
    expect(r.k).toBe(5);
    expect(r.sizes.reduce((a, b) => a + b, 0)).toBe(2);
  });

  it("is deterministic with same seed", () => {
    const data: (number | null)[][] = [
      [1, 1], [2, 2], [10, 10], [11, 11],
    ];
    const r1 = kMeans(data, 2, { seed: 42 });
    const r2 = kMeans(data, 2, { seed: 42 });
    expect(Array.from(r1.assignments)).toEqual(Array.from(r2.assignments));
  });

  it("handles 1D data", () => {
    const data: (number | null)[][] = [
      [1], [2], [3], [100], [101], [102],
    ];
    const r = kMeans(data, 2, { seed: 1 });
    expect(r.k).toBe(2);
    expect(r.assignments[0]).toBe(r.assignments[1]);
    expect(r.assignments[3]).toBe(r.assignments[4]);
    expect(r.assignments[0]).not.toBe(r.assignments[3]);
  });
});
