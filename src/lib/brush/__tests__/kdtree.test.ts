import { describe, it, expect } from "vitest";
import { KdTree2D } from "@/lib/brush/kdtree";

function tree(points: ReadonlyArray<[number, number]>): KdTree2D {
  const xy = new Float64Array(points.length * 2);
  points.forEach(([x, y], i) => { xy[2 * i] = x; xy[2 * i + 1] = y; });
  return new KdTree2D(xy);
}

describe("KdTree2D", () => {
  it("nearest returns the closest point's index", () => {
    const t = tree([[0, 0], [10, 10], [3, 4]]);
    expect(t.nearest(2, 3)).toBe(2);
    expect(t.nearest(11, 12)).toBe(1);
  });

  it("range returns indices inside an inclusive rectangle, in unspecified order", () => {
    const t = tree([[0, 0], [5, 5], [10, 10], [4, 4]]);
    const got = [...t.range(3, 3, 6, 6)].sort((a, b) => a - b);
    expect(got).toEqual([1, 3]);
  });

  it("range with empty result", () => {
    const t = tree([[0, 0], [10, 10]]);
    expect([...t.range(20, 20, 30, 30)]).toEqual([]);
  });

  it("works with a single point", () => {
    const t = tree([[2, 3]]);
    expect(t.nearest(0, 0)).toBe(0);
    expect([...t.range(0, 0, 5, 5)]).toEqual([0]);
  });

  it("exposes source point coordinates by row index", () => {
    const t = tree([[2, 3], [8, 13]]);
    expect(t.point(1)).toEqual({ x: 8, y: 13 });
  });

  it("rejects an empty point set", () => {
    expect(() => new KdTree2D(new Float64Array(0))).toThrow(/empty/i);
  });
});
