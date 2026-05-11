import { describe, it, expect } from "vitest";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeNumericColumn, makeIntegerColumn } from "@/lib/data/columns";
import { toStandardisedMatrix } from "@/lib/tour/standardize";
import { BitMissingMask } from "@/lib/data/missing";

const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

describe("toStandardisedMatrix", () => {
  it("z-scores each column over all rows when shadow is empty", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([1, 2, 3])),
      makeIntegerColumn("b", new Int32Array([10, 20, 30])),
    ]);
    const m = toStandardisedMatrix(df, ["a", "b"], new Uint8Array(1));
    expect(close(m.values[0]!, -1)).toBe(true);
    expect(close(m.values[2]!, 0)).toBe(true);
    expect(close(m.values[4]!, 1)).toBe(true);
    expect(close(m.values[1]!, -1)).toBe(true);
    expect(close(m.values[3]!, 0)).toBe(true);
    expect(close(m.values[5]!, 1)).toBe(true);
  });

  it("treats missing rows as 0 (mean) and excludes them from the moments", () => {
    const mask = new BitMissingMask(3);
    mask.setMissing(2, true);
    const df = new ArrayDataFrame([makeNumericColumn("a", new Float64Array([1, 3, 0]), mask)]);
    const m = toStandardisedMatrix(df, ["a"], new Uint8Array(1));
    const sd = Math.SQRT2;
    expect(close(m.values[0]!, (1 - 2) / sd)).toBe(true);
    expect(close(m.values[1]!, (3 - 2) / sd)).toBe(true);
    expect(close(m.values[2]!, 0)).toBe(true);
  });

  it("respects the shadow mask when computing moments", () => {
    const df = new ArrayDataFrame([makeNumericColumn("a", new Float64Array([1, 2, 100]))]);
    const shadow = new Uint8Array([0b00000100]); // row 2 excluded
    const m = toStandardisedMatrix(df, ["a"], shadow);
    const sd = Math.sqrt(0.5);
    expect(close(m.values[0]!, (1 - 1.5) / sd)).toBe(true);
    expect(close(m.values[1]!, (2 - 1.5) / sd)).toBe(true);
    expect(close(m.values[2]!, (100 - 1.5) / sd)).toBe(true);
  });

  it("constant column → all zeros, no NaN", () => {
    const df = new ArrayDataFrame([makeNumericColumn("a", new Float64Array([5, 5, 5]))]);
    const m = toStandardisedMatrix(df, ["a"], new Uint8Array(1));
    expect(Array.from(m.values)).toEqual([0, 0, 0]);
  });
});
