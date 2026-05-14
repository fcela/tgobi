import { describe, expect, it } from "vitest";
import { coerceDataFrame } from "@/lib/data/coerce";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeCategoricalColumn, makeNumericColumn } from "@/lib/data/columns";
import { BitMissingMask } from "@/lib/data/missing";

describe("coerceDataFrame", () => {
  it("converts numeric columns to categorical levels", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2, 1])),
    ]);
    const out = coerceDataFrame(df, { x: "categorical" });
    const col = out.column("x");
    expect(col?.type).toBe("categorical");
    if (col?.type === "categorical") {
      expect(col.levels).toEqual(["1", "2"]);
      expect(Array.from(col.codes)).toEqual([0, 1, 0]);
    }
  });

  it("converts categorical numeric labels to numeric values and marks invalid labels missing", () => {
    const df = new ArrayDataFrame([
      makeCategoricalColumn("g", new Int32Array([0, 1, 2]), ["1.5", "bad", "3"]),
    ]);
    const out = coerceDataFrame(df, { g: "numeric" });
    const col = out.column("g");
    expect(col?.type).toBe("numeric");
    if (col?.type === "numeric") {
      expect(col.values[0]).toBe(1.5);
      expect(col.missing.isMissing(1)).toBe(true);
      expect(col.values[2]).toBe(3);
    }
  });

  it("converts numeric to integer only when values are integers", () => {
    const missing = new BitMissingMask(3);
    missing.setMissing(2, true);
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2.5, 0]), missing),
    ]);
    const out = coerceDataFrame(df, { x: "integer" });
    const col = out.column("x");
    expect(col?.type).toBe("integer");
    if (col?.type === "integer") {
      expect(col.values[0]).toBe(1);
      expect(col.missing.isMissing(1)).toBe(true);
      expect(col.missing.isMissing(2)).toBe(true);
    }
  });
});
