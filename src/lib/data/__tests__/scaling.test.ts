import { describe, it, expect } from "vitest";
import { scaleColumn } from "@/lib/data/scaling";
import { BitMissingMask } from "@/lib/data/missing";

function makeMask(n: number, missingIndices: number[] = []): BitMissingMask {
  const m = new BitMissingMask(n);
  for (const i of missingIndices) m.setMissing(i, true);
  return m;
}

describe("scaleColumn", () => {
  const values = new Float64Array([1, 2, 3, 4, 5]);
  const noMissing = makeMask(5);

  it("range scales to [0, 1]", () => {
    const result = scaleColumn(values, noMissing, "range");
    expect(result.values[0]).toBe(0);
    expect(result.values[4]).toBe(1);
    expect(result.values[2]).toBeCloseTo(0.5);
  });

  it("range handles constant column", () => {
    const constVals = new Float64Array([7, 7, 7]);
    const result = scaleColumn(constVals, makeMask(3), "range");
    expect(result.values[0]).toBe(0);
    expect(result.values[1]).toBe(0);
    expect(result.values[2]).toBe(0);
  });

  it("standardize centers to mean 0 sd 1", () => {
    const result = scaleColumn(values, noMissing, "standardize");
    let sum = 0;
    for (let i = 0; i < 5; i++) sum += result.values[i]!;
    expect(sum / 5).toBeCloseTo(0, 5);
    let ss = 0;
    for (let i = 0; i < 5; i++) ss += result.values[i]! ** 2;
    expect(Math.sqrt(ss / 4)).toBeCloseTo(1, 5);
  });

  it("standardize handles constant column", () => {
    const constVals = new Float64Array([3, 3, 3]);
    const result = scaleColumn(constVals, makeMask(3), "standardize");
    expect(result.values[0]).toBe(0);
    expect(result.values[1]).toBe(0);
    expect(result.values[2]).toBe(0);
  });

  it("robust scales using median and MAD", () => {
    const result = scaleColumn(values, noMissing, "robust");
    const medianIndex = 2;
    expect(result.values[medianIndex]).toBeCloseTo(0, 5);
  });

  it("robust assigns much larger absolute value to outlier than standardize", () => {
    const outlierVals = new Float64Array([1, 2, 3, 4, 100]);
    const robust = scaleColumn(outlierVals, makeMask(5), "robust");
    const standard = scaleColumn(outlierVals, makeMask(5), "standardize");
    expect(Math.abs(robust.values[4]!)).toBeGreaterThan(Math.abs(standard.values[4]!));
  });

  it("robust handles constant column", () => {
    const constVals = new Float64Array([5, 5, 5]);
    const result = scaleColumn(constVals, makeMask(3), "robust");
    expect(result.values[0]).toBe(0);
    expect(result.values[1]).toBe(0);
    expect(result.values[2]).toBe(0);
  });

  it("preserves missing values in mask", () => {
    const mask = makeMask(5, [1, 3]);
    const result = scaleColumn(values, mask, "range");
    const missingBit = (i: number) => (result.missing[i >> 3]! >> (i & 7)) & 1;
    expect(missingBit(1)).toBe(1);
    expect(missingBit(3)).toBe(1);
    expect(missingBit(0)).toBe(0);
    expect(missingBit(2)).toBe(0);
    expect(missingBit(4)).toBe(0);
  });

  it("range with missing values skips them", () => {
    const mask = makeMask(5, [0, 4]);
    const result = scaleColumn(values, mask, "range");
    expect(result.values[1]).toBeCloseTo(0);
    expect(result.values[3]).toBeCloseTo(1);
  });

  it("works with Int32Array input", () => {
    const intVals = new Int32Array([10, 20, 30]);
    const result = scaleColumn(intVals, makeMask(3), "range");
    expect(result.values[0]).toBe(0);
    expect(result.values[1]).toBeCloseTo(0.5);
    expect(result.values[2]).toBe(1);
  });

  it("handles all-missing column", () => {
    const mask = makeMask(3, [0, 1, 2]);
    const vals = new Float64Array([1, 2, 3]);
    const result = scaleColumn(vals, mask, "standardize");
    expect(result.values[0]).toBe(0);
    expect(result.values[1]).toBe(0);
    expect(result.values[2]).toBe(0);
    const missingBit = (i: number) => (result.missing[i >> 3]! >> (i & 7)) & 1;
    expect(missingBit(0)).toBe(1);
    expect(missingBit(1)).toBe(1);
    expect(missingBit(2)).toBe(1);
  });
});
