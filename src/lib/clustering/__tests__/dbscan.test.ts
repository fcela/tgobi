import { describe, it, expect } from "vitest";
import { dbscan } from "../dbscan";

describe("dbscan", () => {
  it("returns empty result for empty data", () => {
    const r = dbscan([], 1, 2);
    expect(r.assignments.length).toBe(0);
    expect(r.k).toBe(0);
  });

  it("clusters two well-separated blobs", () => {
    const data: (number | null)[][] = [];
    for (let i = 0; i < 5; i++) data.push([0, 0]);
    for (let i = 0; i < 5; i++) data.push([100, 100]);
    const r = dbscan(data, 5, 2);
    expect(r.k).toBe(2);
    const c0 = r.assignments[0]!;
    const c5 = r.assignments[5]!;
    expect(c0).not.toBe(c5);
    for (let i = 0; i < 5; i++) expect(r.assignments[i]).toBe(c0);
    for (let i = 5; i < 10; i++) expect(r.assignments[i]).toBe(c5);
  });

  it("handles missing values by assigning -1", () => {
    const data: (number | null)[][] = [
      [0, 0],
      [null, 2],
      [0.1, 0.1],
      [0.2, 0.2],
    ];
    const r = dbscan(data, 5, 2);
    expect(r.assignments[1]).toBe(-1);
    expect(r.assignments[0]).toBeGreaterThanOrEqual(0);
  });

  it("assigns -1 to noise points", () => {
    const data: (number | null)[][] = [
      [0, 0],
      [0.1, 0.1],
      [100, 100],
    ];
    const r = dbscan(data, 1, 2);
    expect(r.assignments[2]).toBe(-1);
  });

  it("returns correct sizes", () => {
    const data: (number | null)[][] = [];
    for (let i = 0; i < 3; i++) data.push([0, 0]);
    for (let i = 0; i < 5; i++) data.push([100, 100]);
    const r = dbscan(data, 5, 2);
    expect(r.sizes.length).toBe(2);
    expect(r.sizes.reduce((a, b) => a + b, 0)).toBe(8);
  });

  it("handles all-noise data", () => {
    const data: (number | null)[][] = [[0], [100], [200]];
    const r = dbscan(data, 1, 2);
    expect(r.k).toBe(0);
  });
});
