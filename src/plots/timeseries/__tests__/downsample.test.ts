import { describe, it, expect } from "vitest";
import { minMaxDecimate } from "@/plots/timeseries/downsample";

describe("minMaxDecimate", () => {
  const noMissing = new Uint8Array(1);
  const noShadow = new Uint8Array(1);

  it("returns identity for small datasets", () => {
    const x = new Float64Array([1, 2, 3, 4, 5]);
    const y = new Float64Array([10, 20, 30, 40, 50]);
    const result = minMaxDecimate(x, y, noMissing, noMissing, 100, noShadow);
    expect(result.binCount).toBe(5);
    expect(result.x.length).toBe(5);
    expect(result.yMin[0]).toBe(10);
    expect(result.yMax[4]).toBe(50);
  });

  it("reduces bin count for large datasets", () => {
    const n = 10000;
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      x[i] = i;
      y[i] = Math.sin(i * 0.01);
    }
    const result = minMaxDecimate(x, y, noMissing, noMissing, 200, noShadow);
    expect(result.binCount).toBeLessThanOrEqual(200);
    expect(result.binCount).toBeGreaterThan(0);
    expect(result.x.length).toBe(result.binCount);
    expect(result.yMin.length).toBe(result.binCount);
    expect(result.yMax.length).toBe(result.binCount);
  });

  it("preserves min and max within each bin", () => {
    const n = 1000;
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      x[i] = i;
      y[i] = i % 10 === 0 ? 100 : i % 10;
    }
    const result = minMaxDecimate(x, y, noMissing, noMissing, 50, noShadow);
    for (let b = 0; b < result.binCount; b++) {
      expect(result.yMax[b]!).toBeGreaterThanOrEqual(result.yMin[b]!);
    }
    let globalMin = Infinity;
    let globalMax = -Infinity;
    for (let i = 0; i < n; i++) {
      if (y[i]! < globalMin) globalMin = y[i]!;
      if (y[i]! > globalMax) globalMax = y[i]!;
    }
    expect(Math.min(...result.yMin.subarray(0, result.binCount))).toBeCloseTo(globalMin, 5);
    expect(Math.max(...result.yMax.subarray(0, result.binCount))).toBeCloseTo(globalMax, 5);
  });

  it("skips missing values", () => {
    const x = new Float64Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const y = new Float64Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const xMissing = new Uint8Array(2);
    bitSet(xMissing, 5);
    const result = minMaxDecimate(x, y, xMissing, noMissing, 10, noShadow);
    for (let b = 0; b < result.binCount; b++) {
      expect(result.indices[b]).not.toBe(5);
    }
  });

  it("skips shadowed rows", () => {
    const n = 100;
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) { x[i] = i; y[i] = i; }
    const shadow = new Uint8Array(Math.ceil(n / 8));
    bitSet(shadow, 50);
    const result = minMaxDecimate(x, y, noMissing, noMissing, 20, shadow);
    for (let b = 0; b < result.binCount; b++) {
      expect(result.indices[b]).not.toBe(50);
    }
  });

  it("handles all-missing data", () => {
    const x = new Float64Array([1, 2, 3]);
    const y = new Float64Array([10, 20, 30]);
    const xMissing = new Uint8Array(1);
    bitSet(xMissing, 0); bitSet(xMissing, 1); bitSet(xMissing, 2);
    const result = minMaxDecimate(x, y, xMissing, noMissing, 10, noShadow);
    expect(result.binCount).toBe(0);
  });
});

function bitSet(mask: Uint8Array, i: number) {
  const byte = i >> 3;
  const bit = i & 7;
  mask[byte]! |= 1 << bit;
}
