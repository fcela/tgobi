import { describe, it, expect } from "vitest";
import { computeRings, valToAngle, dataRange } from "../concentricRender";

function makeCol(values: number[], missing: number[] = []) {
  const arr = new Float64Array(values);
  const buf = new Uint8Array(Math.ceil(values.length / 8));
  for (const i of missing) {
    const byte = i >> 3;
    const bit = i & 7;
    buf[byte]! |= 1 << bit;
  }
  return { values: arr, missing: buf };
}

describe("dataRange", () => {
  it("computes min/max of non-missing values", () => {
    const col = makeCol([1, 2, 3, 4, 5], [2]);
    const { min, max } = dataRange(col.values, col.missing);
    expect(min).toBe(1);
    expect(max).toBe(5);
  });

  it("returns 0-1 for all missing", () => {
    const col = makeCol([1], [0]);
    const { min, max } = dataRange(col.values, col.missing);
    expect(min).toBe(0);
    expect(max).toBe(1);
  });

  it("pads when min === max", () => {
    const col = makeCol([3, 3, 3]);
    const { min, max } = dataRange(col.values, col.missing);
    expect(min).toBe(2.5);
    expect(max).toBe(3.5);
  });
});

describe("valToAngle", () => {
  it("maps min to -π/2 (top of circle)", () => {
    expect(valToAngle(0, 0, 1)).toBeCloseTo(-Math.PI / 2, 10);
  });

  it("maps max to 3π/2 (top of circle, full rotation)", () => {
    expect(valToAngle(1, 0, 1)).toBeCloseTo(3 * Math.PI / 2, 10);
  });

  it("maps midpoint to π/2 (bottom of circle)", () => {
    expect(valToAngle(0.5, 0, 1)).toBeCloseTo(Math.PI / 2, 10);
  });
});

describe("computeRings", () => {
  it("creates rings for each variable", () => {
    const cols = [makeCol([1, 2, 3]), makeCol([4, 5, 6])];
    const rings = computeRings(400, 400, ["a", "b"], cols);
    expect(rings.length).toBe(2);
    expect(rings[0]!.label).toBe("a");
    expect(rings[1]!.label).toBe("b");
  });

  it("inner rings are smaller than outer rings", () => {
    const cols = [makeCol([1, 2, 3]), makeCol([4, 5, 6]), makeCol([7, 8, 9])];
    const rings = computeRings(400, 400, ["a", "b", "c"], cols);
    expect(rings[0]!.midR).toBeLessThan(rings[1]!.midR);
    expect(rings[1]!.midR).toBeLessThan(rings[2]!.midR);
  });

  it("handles null columns gracefully", () => {
    const cols = [null, makeCol([1, 2, 3])];
    const rings = computeRings(400, 400, ["a", "b"], cols);
    expect(rings[0]!.min).toBe(0);
    expect(rings[0]!.max).toBe(1);
  });

  it("returns empty array for no variables", () => {
    const rings = computeRings(400, 400, [], []);
    expect(rings).toEqual([]);
  });
});
