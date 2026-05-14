import { describe, it, expect } from "vitest";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeIntegerColumn, makeNumericColumn } from "@/lib/data/columns";
import { applyTransform } from "@/lib/data/transforms";

describe("ArrayDataFrame", () => {
  it("wraps columns and exposes nrow", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2, 3])),
      makeIntegerColumn("y", new Int32Array([10, 20, 30])),
    ]);
    expect(df.nrow).toBe(3);
    expect(df.columns).toHaveLength(2);
    expect(df.column("x")?.type).toBe("numeric");
    expect(df.column("missing")).toBeUndefined();
  });

  it("rejects mismatched column lengths", () => {
    expect(
      () =>
        new ArrayDataFrame([
          makeNumericColumn("x", new Float64Array([1, 2, 3])),
          makeNumericColumn("y", new Float64Array([1, 2])),
        ]),
    ).toThrow(/length/);
  });

  it("rejects duplicate column names", () => {
    expect(
      () =>
        new ArrayDataFrame([
          makeNumericColumn("x", new Float64Array([1])),
          makeNumericColumn("x", new Float64Array([2])),
        ]),
    ).toThrow(/duplicate/);
  });

  it("zero-row dataframe is allowed and reports nrow 0", () => {
    const df = new ArrayDataFrame([]);
    expect(df.nrow).toBe(0);
    expect(df.columns).toHaveLength(0);
  });
});

describe("ArrayDataFrame.derive", () => {
  it("returns a new DataFrame with the derived column appended (lazy + cached)", () => {
    const base = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2, 4, 8])),
    ]);
    const derived = base.derive("log_x", { kind: "log", source: "x" });
    expect(derived.nrow).toBe(4);
    expect(derived.column("x")).toBe(base.column("x"));    // base shared
    const log_x = derived.column("log_x");
    expect(log_x).toBeDefined();
    expect(log_x!.type).toBe("numeric");
    if (log_x?.type === "numeric") {
      expect(log_x.values[2]).toBeCloseTo(Math.log(4));
    }
    // calling again returns the same column instance (cached)
    expect(derived.column("log_x")).toBe(log_x);
    // base is unchanged
    expect(base.column("log_x")).toBeUndefined();
  });

  it("refuses to derive a column whose name already exists", () => {
    const base = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2])),
    ]);
    expect(() => base.derive("x", { kind: "log", source: "x" })).toThrow(/exists/);
  });

  it("refuses to derive from an unknown source", () => {
    const base = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2])),
    ]);
    expect(() => base.derive("z", { kind: "log", source: "y" })).toThrow(/source/);
  });

  it("derives can chain", () => {
    const base = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2, 4])),
    ]);
    const d1 = base.derive("log_x", { kind: "log", source: "x" });
    const d2 = d1.derive("z", { kind: "standardize", source: "log_x" });
    expect(d2.column("x")).toBeDefined();
    expect(d2.column("log_x")).toBeDefined();
    expect(d2.column("z")).toBeDefined();
  });

  it("derives power transforms", () => {
    const base = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([2, 3])),
    ]);
    const derived = base.derive("x2", { kind: "power", source: "x", exponent: 2 });
    const x2 = derived.column("x2");
    expect(x2?.type).toBe("numeric");
    if (x2?.type === "numeric") expect(Array.from(x2.values)).toEqual([4, 9]);
  });
});
