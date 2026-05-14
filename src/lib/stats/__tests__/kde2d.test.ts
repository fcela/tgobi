import { describe, it, expect } from "vitest";
import { kde2d, computeContourLevels, marchingSquares } from "@/lib/stats/kde2d";

describe("kde2d", () => {
  it("returns null for empty data", () => {
    expect(kde2d(new Float64Array(0), new Float64Array(0), new Uint8Array(0), new Uint8Array(0), new Uint8Array(0))).toBeNull();
  });

  it("computes a grid for simple data", () => {
    const x = new Float64Array([0, 1, 2, 3, 4]);
    const y = new Float64Array([0, 1, 2, 3, 4]);
    const result = kde2d(x, y, new Uint8Array(0), new Uint8Array(0), new Uint8Array(0), 10);
    expect(result).not.toBeNull();
    expect(result!.nx).toBe(10);
    expect(result!.ny).toBe(10);
    expect(result!.values.length).toBe(100);
    let maxVal = 0;
    for (let k = 0; k < result!.values.length; k++) {
      if (result!.values[k]! > maxVal) maxVal = result!.values[k]!;
    }
    expect(maxVal).toBeGreaterThan(0);
  });

  it("respects missing values", () => {
    const x = new Float64Array([0, 1, 2]);
    const y = new Float64Array([0, 1, 2]);
    const xm = new Uint8Array(1);
    xm[0] = 1;
    const result = kde2d(x, y, xm, new Uint8Array(0), new Uint8Array(0), 5);
    expect(result).not.toBeNull();
  });

  it("respects shadow rows", () => {
    const x = new Float64Array([0, 5, 10]);
    const y = new Float64Array([0, 5, 10]);
    const shadow = new Uint8Array(1);
    shadow[0] = 1;
    const result = kde2d(x, y, new Uint8Array(0), new Uint8Array(0), shadow, 5);
    expect(result).not.toBeNull();
  });
});

describe("computeContourLevels", () => {
  it("returns empty for zero grid", () => {
    const kde = { values: new Float64Array(100), nx: 10, ny: 10, xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
    expect(computeContourLevels(kde, 5)).toEqual([]);
  });

  it("returns levels for non-zero grid", () => {
    const values = new Float64Array(100);
    values[44] = 1.0;
    values[45] = 0.5;
    const kde = { values, nx: 10, ny: 10, xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
    const levels = computeContourLevels(kde, 3);
    expect(levels.length).toBe(3);
    expect(levels[0]!).toBeGreaterThan(0);
    expect(levels[2]!).toBeLessThan(1);
  });
});

describe("marchingSquares", () => {
  it("returns empty for uniform grid", () => {
    const values = new Float64Array(100);
    const kde = { values, nx: 10, ny: 10, xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
    const paths = marchingSquares(kde, 0.5);
    expect(paths.length).toBe(0);
  });

  it("produces paths for a bump", () => {
    const values = new Float64Array(100);
    values[44] = 1.0;
    values[45] = 0.8;
    values[54] = 0.8;
    values[55] = 0.6;
    const kde = { values, nx: 10, ny: 10, xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
    const paths = marchingSquares(kde, 0.5);
    expect(paths.length).toBeGreaterThanOrEqual(1);
    expect(paths[0]!.length).toBeGreaterThanOrEqual(3);
  });
});
