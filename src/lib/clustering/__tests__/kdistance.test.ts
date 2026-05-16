import { describe, it, expect } from "vitest";
import { kDistance } from "@/lib/clustering/kdistance";

describe("kDistance", () => {
  it("returns sorted distances", () => {
    const data = [[0], [1], [2], [10], [11]];
    const dists = kDistance(data, 2);
    expect(dists.length).toBe(5);
    for (let i = 1; i < dists.length; i++) {
      expect(dists[i]!).toBeGreaterThanOrEqual(dists[i - 1]!);
    }
  });

  it("returns correct k-th nearest neighbor distance", () => {
    const data = [[0], [1], [3]];
    const dists = kDistance(data, 1);
    expect(dists[0]).toBeCloseTo(1);
  });

  it("handles empty data", () => {
    const dists = kDistance([], 3);
    expect(dists.length).toBe(0);
  });

  it("handles single point", () => {
    const dists = kDistance([[0, 0]], 1);
    expect(dists.length).toBe(1);
  });
});
