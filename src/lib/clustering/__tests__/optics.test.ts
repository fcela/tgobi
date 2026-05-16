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

  it("returns reachability array", () => {
    const data: (number | null)[][] = [];
    for (let i = 0; i < 5; i++) data.push([0, 0]);
    for (let i = 0; i < 5; i++) data.push([100, 100]);
    const r = optics(data, 5, 2, 0.05);
    expect(r.reachability.length).toBe(10);
  });

  it("assigns different cluster ids to well-separated groups", () => {
    const data: (number | null)[][] = [];
    for (let i = 0; i < 10; i++) data.push([0, 0]);
    for (let i = 0; i < 10; i++) data.push([50, 50]);
    for (let i = 0; i < 10; i++) data.push([100, 100]);
    const r = optics(data, 5, 2, 0.05);
    expect(r.k).toBeGreaterThanOrEqual(2);
    const ids = new Set<number>();
    for (let i = 0; i < r.assignments.length; i++) {
      if (r.assignments[i]! >= 0) ids.add(r.assignments[i]!);
    }
    expect(ids.size).toBeGreaterThanOrEqual(2);
  });
});
