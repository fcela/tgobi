import { describe, it, expect } from "vitest";
import { KdTree2D } from "@/lib/brush/kdtree";
import {
  pointsInEllipse, pointsInPolygon, pointsInRect,
  bitGet, bitSet, bitClear, packedBitsAllZero,
} from "@/lib/brush/hitTest";

function tree(points: ReadonlyArray<[number, number]>): KdTree2D {
  const xy = new Float64Array(points.length * 2);
  points.forEach(([x, y], i) => { xy[2 * i] = x; xy[2 * i + 1] = y; });
  return new KdTree2D(xy);
}

describe("pointsInRect", () => {
  it("returns sorted indices inside the rect", () => {
    const t = tree([[0, 0], [5, 5], [10, 10], [4, 4]]);
    const out = pointsInRect(t, { x0: 3, y0: 3, x1: 6, y1: 6 });
    expect(Array.from(out)).toEqual([1, 3]);
  });
});

describe("shape hit tests", () => {
  it("filters rectangle candidates to points inside an ellipse", () => {
    const t = tree([[0, 0], [5, 5], [10, 10], [5, 9]]);
    const out = pointsInEllipse(t, { x0: 0, y0: 0, x1: 10, y1: 10 });
    expect(Array.from(out)).toEqual([1, 3]);
  });

  it("filters rectangle candidates to points inside a polygon", () => {
    const t = tree([[1, 1], [4, 4], [8, 1], [8, 8]]);
    const out = pointsInPolygon(t, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 6 },
    ]);
    expect(Array.from(out)).toEqual([0, 1, 2]);
  });
});

describe("packed-bit helpers", () => {
  it("bitGet / bitSet / bitClear roundtrip", () => {
    const buf = new Uint8Array(2);
    expect(bitGet(buf, 0)).toBe(false);
    bitSet(buf, 3);
    bitSet(buf, 9);
    expect(bitGet(buf, 3)).toBe(true);
    expect(bitGet(buf, 9)).toBe(true);
    expect(bitGet(buf, 4)).toBe(false);
    bitClear(buf, 3);
    expect(bitGet(buf, 3)).toBe(false);
  });

  it("packedBitsAllZero", () => {
    const buf = new Uint8Array(2);
    expect(packedBitsAllZero(buf)).toBe(true);
    bitSet(buf, 12);
    expect(packedBitsAllZero(buf)).toBe(false);
  });
});
