import { describe, it, expect } from "vitest";
import { applyTransform } from "@/lib/data/transforms";
import { makeIntegerColumn, makeNumericColumn } from "@/lib/data/columns";
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

  it("accepts integer source", () => {
    const src = makeIntegerColumn("k", new Int32Array([1, 2, 4]));
    const out = applyTransform({ kind: "sqrt", source: "k" }, src, "sk");
    expect(Array.from(out.values)).toEqual([1, Math.SQRT2, 2]);
  });
});
