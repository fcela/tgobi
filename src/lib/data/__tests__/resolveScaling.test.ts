import { describe, it, expect } from "vitest";
import { resolveScaledValues, scalingLabel } from "@/lib/data/resolveScaling";
import { BitMissingMask } from "@/lib/data/missing";
import type { Column } from "@/lib/data/types";
import type { VarSpec, ScalingMode } from "@/types";

function makeNumericCol(name: string, values: number[], missing: number[] = []) {
  const n = values.length;
  const arr = new Float64Array(values);
  const mask = new BitMissingMask(n);
  for (const i of missing) mask.setMissing(i, true);
  return { type: "numeric" as const, name, length: n, values: arr, missing: mask };
}

describe("resolveScaledValues", () => {
  it("returns raw values when no scaling specified", () => {
    const col = makeNumericCol("x", [1, 2, 3]);
    const result = resolveScaledValues(col, undefined);
    expect(result.values).toBe(col.values);
    expect(result.missingBuffer).toBe(col.missing.buffer);
  });

  it("returns raw values when VarSpec has no scaling", () => {
    const col = makeNumericCol("x", [1, 2, 3]);
    const spec: VarSpec = { name: "x", type: "numeric", included: true };
    const result = resolveScaledValues(col, spec);
    expect(result.values).toBe(col.values);
  });

  it("returns scaled values when scaling is set", () => {
    const col = makeNumericCol("x", [1, 2, 3, 4, 5]);
    const spec: VarSpec = { name: "x", type: "numeric", included: true, scaling: "range" };
    const result = resolveScaledValues(col, spec);
    expect(result.values[0]).toBe(0);
    expect(result.values[4]).toBe(1);
    expect(result.values).not.toBe(col.values);
  });

  it("returns raw values for non-numeric column even with scaling", () => {
    const mask = new BitMissingMask(3);
    const col: Column = { type: "categorical", name: "cat", length: 3, codes: new Int32Array([0, 1, 0]), levels: ["a", "b"], missing: mask };
    const spec: VarSpec = { name: "cat", type: "categorical", included: true, scaling: "range" };
    const result = resolveScaledValues(col, spec);
    expect(result.values).toBe(col.codes);
  });

  it("handles standardize scaling", () => {
    const col = makeNumericCol("x", [2, 4, 4, 4, 5, 5, 7, 9]);
    const spec: VarSpec = { name: "x", type: "numeric", included: true, scaling: "standardize" };
    const result = resolveScaledValues(col, spec);
    let sum = 0;
    for (let i = 0; i < col.length; i++) sum += result.values[i]!;
    expect(sum / col.length).toBeCloseTo(0, 10);
  });
});

describe("scalingLabel", () => {
  it("returns correct labels", () => {
    expect(scalingLabel(undefined)).toBe("raw");
    expect(scalingLabel("range")).toBe("0–1");
    expect(scalingLabel("standardize")).toBe("z-score");
    expect(scalingLabel("robust")).toBe("robust");
  });
});
