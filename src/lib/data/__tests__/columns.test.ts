import { describe, it, expect } from "vitest";
import {
  makeNumericColumn,
  makeIntegerColumn,
  makeCategoricalColumn,
  makeDateColumn,
} from "@/lib/data/columns";
import { BitMissingMask } from "@/lib/data/missing";

describe("makeNumericColumn", () => {
  it("creates a numeric column from values + optional mask", () => {
    const col = makeNumericColumn("x", new Float64Array([1, 2, 3]));
    expect(col.type).toBe("numeric");
    expect(col.name).toBe("x");
    expect(col.length).toBe(3);
    expect(Array.from(col.values)).toEqual([1, 2, 3]);
    expect(col.missing.count()).toBe(0);
  });

  it("accepts a missing mask", () => {
    const m = new BitMissingMask(3);
    m.setMissing(1, true);
    const col = makeNumericColumn("x", new Float64Array([1, 0, 3]), m);
    expect(col.missing.isMissing(1)).toBe(true);
  });
});

describe("makeIntegerColumn", () => {
  it("creates an integer column", () => {
    const col = makeIntegerColumn("k", new Int32Array([10, 20, 30]));
    expect(col.type).toBe("integer");
    expect(col.values[2]).toBe(30);
    expect(col.length).toBe(3);
  });
});

describe("makeCategoricalColumn", () => {
  it("creates a categorical column", () => {
    const col = makeCategoricalColumn("g", new Int32Array([0, 1, 0, 2]), ["a", "b", "c"]);
    expect(col.type).toBe("categorical");
    expect(col.codes[3]).toBe(2);
    expect(col.levels).toEqual(["a", "b", "c"]);
    expect(col.length).toBe(4);
  });

  it("rejects out-of-range codes (non-missing)", () => {
    expect(() =>
      makeCategoricalColumn("g", new Int32Array([0, 5]), ["a"]),
    ).toThrow(/code/);
  });
});

describe("makeDateColumn", () => {
  it("creates a date column", () => {
    const col = makeDateColumn("d", new Float64Array([0, 1000]));
    expect(col.type).toBe("date");
    expect(col.values[1]).toBe(1000);
  });
});
