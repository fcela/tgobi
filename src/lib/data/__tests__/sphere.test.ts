import { describe, expect, it } from "vitest";
import { makeCategoricalColumn, makeNumericColumn } from "@/lib/data/columns";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { BitMissingMask } from "@/lib/data/missing";
import { deriveSphereColumns } from "@/lib/data/sphere";
import type { NumericColumn } from "@/lib/data/types";

describe("deriveSphereColumns", () => {
  it("creates centered decorrelated numeric columns", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2, 3, 5, 8])),
      makeNumericColumn("y", new Float64Array([1, 4, 2, 7, 3])),
    ]);

    const result = deriveSphereColumns(df, ["x", "y"], "sphere");
    expect(result.names).toEqual(["sphere_x", "sphere_y"]);
    expect(result.columns.map((c) => c.type)).toEqual(["numeric", "numeric"]);
    expect(result.df.column("sphere_x")?.type).toBe("numeric");
    expect(result.df.column("sphere_y")?.type).toBe("numeric");

    const sx = result.df.column("sphere_x") as NumericColumn;
    const sy = result.df.column("sphere_y") as NumericColumn;
    expect(mean(sx)).toBeCloseTo(0, 10);
    expect(mean(sy)).toBeCloseTo(0, 10);
    expect(covariance(sx, sx)).toBeCloseTo(1, 10);
    expect(covariance(sy, sy)).toBeCloseTo(1, 10);
    expect(covariance(sx, sy)).toBeCloseTo(0, 10);
  });

  it("propagates missing source rows to every sphered component", () => {
    const missing = new BitMissingMask(4);
    missing.setMissing(1, true);
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 0, 3, 5]), missing),
      makeNumericColumn("y", new Float64Array([1, 4, 2, 7])),
    ]);

    const result = deriveSphereColumns(df, ["x", "y"], "s");
    expect(result.columns[0]!.missing.isMissing(1)).toBe(true);
    expect(result.columns[1]!.missing.isMissing(1)).toBe(true);
    expect(result.columns[0]!.missing.count()).toBe(1);
    expect(result.columns[1]!.missing.count()).toBe(1);
  });

  it("requires numeric source variables", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2, 3])),
      makeCategoricalColumn("g", new Int32Array([0, 1, 0]), ["a", "b"]),
    ]);

    expect(() => deriveSphereColumns(df, ["x", "g"], "s")).toThrow(/not numeric/);
  });
});

function mean(col: NumericColumn): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < col.length; i++) {
    if (col.missing.isMissing(i)) continue;
    sum += col.values[i]!;
    n++;
  }
  return sum / n;
}

function covariance(a: NumericColumn, b: NumericColumn): number {
  const ma = mean(a);
  const mb = mean(b);
  let sum = 0;
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    if (a.missing.isMissing(i) || b.missing.isMissing(i)) continue;
    sum += (a.values[i]! - ma) * (b.values[i]! - mb);
    n++;
  }
  return sum / (n - 1);
}
