import { describe, it, expect } from "vitest";
import { xMeans } from "../xmeans";

describe("xMeans", () => {
  it("returns empty result for empty data", () => {
    const r = xMeans([], 10);
    expect(r.assignments.length).toBe(0);
    expect(r.k).toBe(0);
  });

  it("finds clusters for two well-separated blobs", () => {
    const data: (number | null)[][] = [];
    for (let i = 0; i < 20; i++) data.push([0, 0]);
    for (let i = 0; i < 20; i++) data.push([100, 100]);
    const r = xMeans(data, 5);
    expect(r.k).toBeGreaterThanOrEqual(2);
    expect(r.assignments.length).toBe(40);
  });

  it("handles missing values by assigning -1", () => {
    const data: (number | null)[][] = [
      [0, 0],
      [null, 2],
      [0.1, 0.1],
      [0.2, 0.2],
    ];
    const r = xMeans(data, 3);
    expect(r.assignments[1]).toBe(-1);
  });

  it("respects kMax", () => {
    const data: (number | null)[][] = [];
    for (let i = 0; i < 10; i++) data.push([i, i]);
    const r = xMeans(data, 3);
    expect(r.k).toBeLessThanOrEqual(3);
  });
});
