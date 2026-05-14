import { describe, it, expect } from "vitest";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeNumericColumn, makeCategoricalColumn } from "@/lib/data/columns";
import { BitMissingMask } from "@/lib/data/missing";
import {
  missingnessMatrix,
  missingnessPatterns,
  variableMissingSummaries,
  rowMissingCounts,
  createMissingIndicatorColumns,
  imputeFixedValue,
  imputeRandomObserved,
  imputeConditionalRandom,
} from "@/lib/data/missingness";

function makeDf() {
  const maskA = new BitMissingMask(5);
  maskA.setMissing(1, true);
  maskA.setMissing(3, true);

  const maskB = new BitMissingMask(5);
  maskB.setMissing(3, true);
  maskB.setMissing(4, true);

  const maskC = new BitMissingMask(5);
  maskC.setMissing(0, true);

  return new ArrayDataFrame([
    makeNumericColumn("a", new Float64Array([1, 2, 3, 4, 5]), maskA),
    makeNumericColumn("b", new Float64Array([10, 20, 30, 40, 50]), maskB),
    makeNumericColumn("c", new Float64Array([100, 200, 300, 400, 500]), maskC),
  ]);
}

function makeCatDf() {
  const maskA = new BitMissingMask(6);
  maskA.setMissing(2, true);
  maskA.setMissing(5, true);

  const maskG = new BitMissingMask(6);
  maskG.setMissing(4, true);

  return new ArrayDataFrame([
    makeNumericColumn("x", new Float64Array([1, 2, 3, 4, 5, 6]), maskA),
    makeCategoricalColumn(
      "g",
      new Int32Array([0, 0, 1, 1, 0, 1]),
      ["A", "B"],
      maskG,
    ),
  ]);
}

describe("missingnessMatrix", () => {
  it("builds a binary matrix of missingness", () => {
    const df = makeDf();
    const result = missingnessMatrix(df);
    expect(result.rows).toBe(5);
    expect(result.cols).toBe(3);
    expect(result.varNames).toEqual(["a", "b", "c"]);
    expect(result.matrix[1 * 3 + 0]).toBe(1);
    expect(result.matrix[1 * 3 + 1]).toBe(0);
    expect(result.matrix[3 * 3 + 0]).toBe(1);
    expect(result.matrix[3 * 3 + 1]).toBe(1);
    expect(result.matrix[0 * 3 + 2]).toBe(1);
    expect(result.matrix[2 * 3 + 0]).toBe(0);
  });

  it("filters to specified varNames", () => {
    const df = makeDf();
    const result = missingnessMatrix(df, ["a", "c"]);
    expect(result.cols).toBe(2);
    expect(result.varNames).toEqual(["a", "c"]);
  });
});

describe("missingnessPatterns", () => {
  it("groups rows by missingness pattern", () => {
    const df = makeDf();
    const patterns = missingnessPatterns(df);
    expect(patterns.length).toBeGreaterThan(0);
    const totalRows = patterns.reduce((s, p) => s + p.count, 0);
    expect(totalRows).toBe(5);
  });

  it("sorts patterns by count descending", () => {
    const df = makeDf();
    const patterns = missingnessPatterns(df);
    for (let i = 1; i < patterns.length; i++) {
      expect(patterns[i]!.count).toBeLessThanOrEqual(patterns[i - 1]!.count);
    }
  });

  it("identifies rows with no missing values", () => {
    const df = makeDf();
    const patterns = missingnessPatterns(df);
    const completePattern = patterns.find((p) => p.mask.every((m) => !m));
    expect(completePattern).toBeDefined();
    expect(completePattern!.rows).toContain(2);
  });

  it("identifies rows with multiple missing values", () => {
    const df = makeDf();
    const patterns = missingnessPatterns(df);
    const pattern3 = patterns.find((p) => p.rows.includes(3));
    expect(pattern3).toBeDefined();
    expect(pattern3!.mask[0]).toBe(true);
    expect(pattern3!.mask[1]).toBe(true);
  });
});

describe("variableMissingSummaries", () => {
  it("counts missing per variable", () => {
    const df = makeDf();
    const summaries = variableMissingSummaries(df);
    expect(summaries.length).toBe(3);
    const a = summaries.find((s) => s.name === "a")!;
    expect(a.missing).toBe(2);
    expect(a.total).toBe(5);
    expect(a.percent).toBeCloseTo(40);
    const b = summaries.find((s) => s.name === "b")!;
    expect(b.missing).toBe(2);
    const c = summaries.find((s) => s.name === "c")!;
    expect(c.missing).toBe(1);
  });
});

describe("rowMissingCounts", () => {
  it("counts missing variables per row", () => {
    const df = makeDf();
    const counts = rowMissingCounts(df);
    expect(counts.length).toBe(5);
    expect(counts[0]!.missing).toBe(1);
    expect(counts[1]!.missing).toBe(1);
    expect(counts[2]!.missing).toBe(0);
    expect(counts[3]!.missing).toBe(2);
    expect(counts[4]!.missing).toBe(1);
  });
});

describe("createMissingIndicatorColumns", () => {
  it("creates binary indicator columns", () => {
    const df = makeDf();
    const indicators = createMissingIndicatorColumns(df);
    expect(indicators.length).toBe(3);
    expect(indicators[0]!.name).toBe("miss_a");
    expect(indicators[0]!.values[1]).toBe(1);
    expect(indicators[0]!.values[0]).toBe(0);
    expect(indicators[0]!.values[3]).toBe(1);
    expect(indicators[0]!.values[2]).toBe(0);
  });
});

describe("imputeFixedValue", () => {
  it("replaces missing with a fixed value", () => {
    const df = makeDf();
    const col = df.column("a")!;
    const result = imputeFixedValue(col, -99);
    expect(result[0]).toBe(1);
    expect(result[1]).toBe(-99);
    expect(result[2]).toBe(3);
    expect(result[3]).toBe(-99);
    expect(result[4]).toBe(5);
  });
});

describe("imputeRandomObserved", () => {
  it("replaces missing with random observed values", () => {
    const df = makeDf();
    const col = df.column("a")!;
    const result = imputeRandomObserved(col, 42);
    const observed = [1, 3, 5];
    expect(observed).toContain(result[1]!);
    expect(observed).toContain(result[3]!);
    expect(result[0]).toBe(1);
    expect(result[2]).toBe(3);
    expect(result[4]).toBe(5);
  });

  it("is deterministic with the same seed", () => {
    const df = makeDf();
    const col = df.column("a")!;
    const r1 = imputeRandomObserved(col, 7);
    const r2 = imputeRandomObserved(col, 7);
    expect(r1).toEqual(r2);
  });

  it("produces different results with different seeds", () => {
    const df = makeDf();
    const col = df.column("a")!;
    const r1 = imputeRandomObserved(col, 1);
    const r2 = imputeRandomObserved(col, 5376);
    expect(r1[1]).not.toBe(r2[1]);
  });
});

describe("imputeConditionalRandom", () => {
  it("uses categorical conditioning variable", () => {
    // 8 rows: group A observed x = [1,2,3], missing at row 0; group B observed x = [30,40,50], missing at row 4
    const maskX = new BitMissingMask(8);
    maskX.setMissing(0, true);
    maskX.setMissing(4, true);
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([0, 1, 2, 3, 0, 30, 40, 50]), maskX),
      makeCategoricalColumn(
        "g",
        new Int32Array([0, 0, 0, 0, 1, 1, 1, 1]),
        ["A", "B"],
      ),
    ]);
    const col = df.column("x")!;
    const result = imputeConditionalRandom(df, col, "g", 42);
    const aObserved = [1, 2, 3];
    const bObserved = [30, 40, 50];
    expect(aObserved).toContain(result[0]!);
    expect(bObserved).toContain(result[4]!);
    expect(result[1]).toBe(1);
    expect(result[5]).toBe(30);
  });

  it("falls back to unconditional when condVar is not categorical", () => {
    const df = makeCatDf();
    const col = df.column("x")!;
    const result = imputeConditionalRandom(df, col, "x", 42);
    const allObserved = [1, 2, 3, 4, 5];
    expect(allObserved).toContain(result[2]!);
  });

  it("is deterministic with the same seed", () => {
    const df = makeCatDf();
    const col = df.column("x")!;
    const r1 = imputeConditionalRandom(df, col, "g", 7);
    const r2 = imputeConditionalRandom(df, col, "g", 7);
    expect(r1).toEqual(r2);
  });
});
