import { describe, it, expect } from "vitest";
import { applyTransform } from "@/lib/data/transforms";
import { makeCategoricalColumn, makeIntegerColumn, makeNumericColumn } from "@/lib/data/columns";
import { BitMissingMask } from "@/lib/data/missing";

const approx = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

describe("applyTransform", () => {
  it("log: ln(values), missing propagates, non-positive -> missing", () => {
    const m = new BitMissingMask(4);
    m.setMissing(3, true);
    const src = makeNumericColumn("x", new Float64Array([1, Math.E, 0, 0]), m);
    const out = applyTransform({ kind: "log", source: "x" }, src, "log_x");
    expect(out.type).toBe("numeric");
    expect(out.name).toBe("log_x");
    expect(approx(out.values[0]!, 0)).toBe(true);
    expect(approx(out.values[1]!, 1)).toBe(true);
    expect(out.missing.isMissing(2)).toBe(true);   // log(0) -> missing
    expect(out.missing.isMissing(3)).toBe(true);   // already missing
  });

  it("sqrt", () => {
    const src = makeNumericColumn("x", new Float64Array([0, 1, 4, 9]));
    const out = applyTransform({ kind: "sqrt", source: "x" }, src, "sqrt_x");
    expect(Array.from(out.values)).toEqual([0, 1, 2, 3]);
    expect(out.missing.count()).toBe(0);
  });

  it("sqrt: negative values become missing", () => {
    const src = makeNumericColumn("x", new Float64Array([-1, 4]));
    const out = applyTransform({ kind: "sqrt", source: "x" }, src, "sqrt_x");
    expect(out.missing.isMissing(0)).toBe(true);
    expect(out.values[1]).toBe(2);
  });

  it("negate", () => {
    const src = makeNumericColumn("x", new Float64Array([1, -2, 3]));
    const out = applyTransform({ kind: "negate", source: "x" }, src, "n_x");
    expect(Array.from(out.values)).toEqual([-1, 2, -3]);
  });

  it("power: finite powers are values and invalid results are missing", () => {
    const src = makeNumericColumn("x", new Float64Array([2, -3, 0]));
    const squared = applyTransform({ kind: "power", source: "x", exponent: 2 }, src, "x2");
    expect(Array.from(squared.values)).toEqual([4, 9, 0]);

    const inverse = applyTransform({ kind: "power", source: "x", exponent: -1 }, src, "inv");
    expect(inverse.values[0]).toBe(0.5);
    expect(inverse.values[1]).toBeCloseTo(-1 / 3);
    expect(inverse.missing.isMissing(2)).toBe(true);

    const root = applyTransform({ kind: "power", source: "x", exponent: 0.5 }, src, "root");
    expect(root.values[0]).toBeCloseTo(Math.SQRT2);
    expect(root.missing.isMissing(1)).toBe(true);
  });

  it("standardize: mean 0, sd 1, ignoring missing", () => {
    const m = new BitMissingMask(4);
    m.setMissing(3, true);
    const src = makeNumericColumn("x", new Float64Array([1, 2, 3, 0]), m);
    const out = applyTransform({ kind: "standardize", source: "x" }, src, "z");
    // mean of [1,2,3] = 2, sd = sqrt(((1-2)^2+(2-2)^2+(3-2)^2)/2) = 1
    expect(approx(out.values[0]!, -1)).toBe(true);
    expect(approx(out.values[1]!, 0)).toBe(true);
    expect(approx(out.values[2]!, 1)).toBe(true);
    expect(out.missing.isMissing(3)).toBe(true);
  });

  it("standardize: zero variance -> all zeros, no missing introduced", () => {
    const src = makeNumericColumn("x", new Float64Array([5, 5, 5]));
    const out = applyTransform({ kind: "standardize", source: "x" }, src, "z");
    expect(Array.from(out.values)).toEqual([0, 0, 0]);
  });

  it("rank: average ties, ignoring missing", () => {
    const src = makeNumericColumn("x", new Float64Array([10, 20, 20, 5]));
    const out = applyTransform({ kind: "rank", source: "x" }, src, "r");
    // sorted values: 5(rank1), 10(rank2), 20(rank3.5), 20(rank3.5)
    expect(out.values[0]).toBe(2);
    expect(out.values[1]).toBe(3.5);
    expect(out.values[2]).toBe(3.5);
    expect(out.values[3]).toBe(1);
  });

  it("jitter: deterministic offsets separate ties without mutating source values", () => {
    const src = makeIntegerColumn("k", new Int32Array([1, 1, 1]));
    const a = applyTransform({ kind: "jitter", source: "k", amplitude: 0.25, seed: 7 }, src, "j");
    const b = applyTransform({ kind: "jitter", source: "k", amplitude: 0.25, seed: 7 }, src, "j");
    expect(Array.from(a.values)).toEqual(Array.from(b.values));
    expect(new Set(Array.from(a.values)).size).toBeGreaterThan(1);
    for (const value of a.values) {
      expect(value).toBeGreaterThanOrEqual(0.75);
      expect(value).toBeLessThanOrEqual(1.25);
    }
    expect(Array.from(src.values)).toEqual([1, 1, 1]);
  });

  it("jitter: categorical sources use category codes and propagate missing values", () => {
    const missing = new BitMissingMask(3);
    missing.setMissing(2, true);
    const src = makeCategoricalColumn("g", new Int32Array([0, 1, 0]), ["a", "b"], missing);
    const out = applyTransform({ kind: "jitter", source: "g", amplitude: 0, seed: 3 }, src, "jg");
    expect(Array.from(out.values)).toEqual([0, 1, 0]);
    expect(out.missing.isMissing(2)).toBe(true);
  });

  it("accepts integer source", () => {
    const src = makeIntegerColumn("k", new Int32Array([1, 2, 4]));
    const out = applyTransform({ kind: "sqrt", source: "k" }, src, "sk");
    expect(Array.from(out.values)).toEqual([1, Math.SQRT2, 2]);
  });
});
