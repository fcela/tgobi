import { describe, it, expect } from "vitest";
import { optics } from "../optics";

describe("optics", () => {
  it("returns empty result for empty data", () => {
    const r = optics([], 5, 2, 0.05);
    expect(r.assignments.length).toBe(0);
    expect(r.k).toBe(0);
  });

  it("clusters two well-separated blobs", () => {
    const data: (number | null)[][] = [];
    for (let i = 0; i < 5; i++) data.push([0, 0]);
    for (let i = 0; i < 5; i++) data.push([100, 100]);
    const r = optics(data, 5, 2, 0.05);
    expect(r.assignments.length).toBe(10);
  });

  it("handles missing values by assigning -1", () => {
    const data: (number | null)[][] = [
      [0, 0],
      [null, 2],
      [0.1, 0.1],
      [0.2, 0.2],
    ];
    const r = optics(data, 5, 2, 0.05);
    expect(r.assignments[1]).toBe(-1);
  });

  it("returns ordering array", () => {
    const data: (number | null)[][] = [];
    for (let i = 0; i < 5; i++) data.push([0, 0]);
    for (let i = 0; i < 5; i++) data.push([100, 100]);
    const r = optics(data, 5, 2, 0.05);
    expect(r.ordering.length).toBeGreaterThan(0);
  });
});
