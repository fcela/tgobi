import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeNumericColumn, makeCategoricalColumn } from "@/lib/data/columns";
import { BitMissingMask } from "@/lib/data/missing";

beforeEach(() => {
  const s = useAppStore.getState();
  s.clear();
  s.setImputationMethod("none");
  s.setImputationSeed(0);
  s.setImputationFixedValue(0);
  s.setImputationCondVar(null);
  s.setShowMarginals(false);
  s.setImputationSets(5);
  s.setImputationIndex(0);
});

describe("MissingSlice", () => {
  it("starts with default imputation state", () => {
    const s = useAppStore.getState();
    expect(s.missing.imputation.method).toBe("none");
    expect(s.missing.imputationSets).toBe(5);
    expect(s.missing.imputationIndex).toBe(0);
  });

  it("setImputationSets updates the count", () => {
    useAppStore.getState().setImputationSets(10);
    expect(useAppStore.getState().missing.imputationSets).toBe(10);
  });

  it("cycleImputation does nothing when no data loaded", () => {
    useAppStore.getState().cycleImputation();
    expect(useAppStore.getState().missing.imputationIndex).toBe(0);
  });

  it("cycleImputation advances index even without imputation-derived columns", () => {
    const mask = new BitMissingMask(5);
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2, 3, 4, 5]), mask),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSpec([{ name: "x", type: "numeric", included: true }]);
    useAppStore.getState().setImputationMethod("random");
    useAppStore.getState().setImputationSeed(42);
    useAppStore.getState().cycleImputation();
    expect(useAppStore.getState().missing.imputationIndex).toBe(1);
    useAppStore.getState().cycleImputation();
    expect(useAppStore.getState().missing.imputationIndex).toBe(2);
  });

  it("cycleImputation wraps around after reaching imputationSets", () => {
    const mask = new BitMissingMask(3);
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2, 3]), mask),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSpec([{ name: "x", type: "numeric", included: true }]);
    useAppStore.getState().setImputationMethod("random");
    useAppStore.getState().setImputationSeed(10);
    useAppStore.getState().setImputationSets(3);
    useAppStore.getState().cycleImputation();
    expect(useAppStore.getState().missing.imputationIndex).toBe(1);
    useAppStore.getState().cycleImputation();
    expect(useAppStore.getState().missing.imputationIndex).toBe(2);
    useAppStore.getState().cycleImputation();
    expect(useAppStore.getState().missing.imputationIndex).toBe(0);
  });

  it("cycleImputation rebuilds imputation-derived columns with new seed", () => {
    const maskX = new BitMissingMask(5);
    maskX.setMissing(1, true);
    maskX.setMissing(3, true);
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([1, 2, 3, 4, 5]), maskX),
      makeNumericColumn("b", new Float64Array([10, 20, 30, 40, 50])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSpec([
      { name: "a", type: "numeric", included: true },
      { name: "b", type: "numeric", included: true },
    ]);
    useAppStore.getState().deriveColumn("imp_a", { kind: "imputeRandom", source: "a", seed: 0 });
    const specBefore = useAppStore.getState().spec;
    expect(specBefore.find((v) => v.name === "imp_a")).toBeDefined();
    const colBefore = useAppStore.getState().df!.column("imp_a");
    expect(colBefore).toBeDefined();
    useAppStore.getState().setImputationMethod("random");
    useAppStore.getState().setImputationSeed(0);
    useAppStore.getState().cycleImputation();
    const specAfter = useAppStore.getState().spec;
    expect(specAfter.find((v) => v.name === "imp_a")).toBeDefined();
    const colAfter = useAppStore.getState().df!.column("imp_a");
    expect(colAfter).toBeDefined();
    const d = specAfter.find((v) => v.name === "imp_a")!.derived as { kind: string; seed: number };
    expect(d.kind).toBe("imputeRandom");
    expect(d.seed).toBe(1);
    expect(useAppStore.getState().missing.imputationIndex).toBe(1);
  });

  it("cycleImputation preserves non-imputation derived columns", () => {
    const mask = new BitMissingMask(5);
    mask.setMissing(1, true);
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([1, 2, 3, 4, 5]), mask),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSpec([{ name: "a", type: "numeric", included: true }]);
    useAppStore.getState().deriveColumn("log_a", { kind: "log", source: "a" });
    useAppStore.getState().deriveColumn("imp_a", { kind: "imputeRandom", source: "a", seed: 0 });
    useAppStore.getState().setImputationMethod("random");
    useAppStore.getState().setImputationSeed(0);
    useAppStore.getState().cycleImputation();
    const s = useAppStore.getState();
    expect(s.df!.column("log_a")).toBeDefined();
    expect(s.df!.column("imp_a")).toBeDefined();
    expect(s.spec.find((v) => v.name === "log_a")).toBeDefined();
    expect(s.spec.find((v) => v.name === "imp_a")).toBeDefined();
  });

  it("cycleImputation updates conditional imputation seed", () => {
    const maskX = new BitMissingMask(6);
    maskX.setMissing(2, true);
    const maskG = new BitMissingMask(6);
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2, 3, 4, 5, 6]), maskX),
      makeCategoricalColumn("g", new Int32Array([0, 0, 1, 1, 0, 1]), ["A", "B"], maskG),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSpec([
      { name: "x", type: "numeric", included: true },
      { name: "g", type: "categorical", included: true },
    ]);
    useAppStore.getState().deriveColumn("imp_x", { kind: "imputeConditional", source: "x", condVar: "g", seed: 0 });
    useAppStore.getState().setImputationMethod("conditional");
    useAppStore.getState().setImputationSeed(0);
    useAppStore.getState().cycleImputation();
    const d = useAppStore.getState().spec.find((v) => v.name === "imp_x")!.derived as { kind: string; seed: number };
    expect(d.kind).toBe("imputeConditional");
    expect(d.seed).toBe(1);
  });
});
