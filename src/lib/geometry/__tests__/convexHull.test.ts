import { describe, expect, it } from "vitest";
import { convexHull } from "@/lib/geometry/convexHull";

describe("convexHull", () => {
  it("returns the outer polygon and drops interior points", () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 0.5, y: 0.5 },
    ]);
    expect(hull).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]);
  });

  it("returns empty for collinear points", () => {
    expect(convexHull([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ])).toEqual([]);
  });
});
