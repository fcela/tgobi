import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeNumericColumn, makeCategoricalColumn } from "@/lib/data/columns";
import { bitGet } from "@/lib/brush/hitTest";

const tick = () => new Promise<void>((r) => setTimeout(r, 50));

beforeEach(() => {
  useAppStore.getState().clear();
  useAppStore.getState().resetClassification();
});

describe("ClassificationSlice", () => {
  it("defaults", () => {
    const c = useAppStore.getState().classification;
    expect(c.method).toBe("knn");
    expect(c.variables).toEqual([]);
    expect(c.gridResolution).toBe(5);
    expect(c.knnK).toBe(5);
    expect(c.rfNEstimators).toBe(50);
    expect(c.rfMaxDepth).toBe(10);
    expect(c.boundaryPaint).toBeNull();
    expect(c.gridSize).toBe(0);
    expect(c.running).toBe(false);
    expect(c.error).toBeNull();
  });

  it("setClassificationMethod updates method and clears results", () => {
    useAppStore.getState().setClassificationMethod("randomforest");
    expect(useAppStore.getState().classification.method).toBe("randomforest");
  });

  it("setClassificationVariables updates variables", () => {
    useAppStore.getState().setClassificationVariables(["a", "b"]);
    expect(useAppStore.getState().classification.variables).toEqual(["a", "b"]);
  });

  it("setClassificationGridResolution updates resolution", () => {
    useAppStore.getState().setClassificationGridResolution(8);
    expect(useAppStore.getState().classification.gridResolution).toBe(8);
  });

  it("setClassificationKnnK updates k", () => {
    useAppStore.getState().setClassificationKnnK(7);
    expect(useAppStore.getState().classification.knnK).toBe(7);
  });

  it("setClassificationRfNEstimators updates nEstimators", () => {
    useAppStore.getState().setClassificationRfNEstimators(100);
    expect(useAppStore.getState().classification.rfNEstimators).toBe(100);
  });

  it("setClassificationRfMaxDepth updates maxDepth", () => {
    useAppStore.getState().setClassificationRfMaxDepth(15);
    expect(useAppStore.getState().classification.rfMaxDepth).toBe(15);
  });

  it("runClassification errors without data", () => {
    useAppStore.getState().setClassificationVariables(["a", "b"]);
    useAppStore.getState().runClassification();
    expect(useAppStore.getState().classification.error).toBeTruthy();
  });

  it("runClassification errors without 2+ painted groups", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([1, 2, 3])),
      makeNumericColumn("b", new Float64Array([4, 5, 6])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setClassificationVariables(["a", "b"]);
    useAppStore.getState().runClassification();
    expect(useAppStore.getState().classification.error).toContain("class");
  });

  it("runClassification produces boundary paint with painted groups", async () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([0, 0.1, 10, 10.1])),
      makeNumericColumn("b", new Float64Array([0, 0.1, 10, 10.1])),
    ]);
    useAppStore.getState().setData(df);
    const paint = new Uint8Array([1, 1, 2, 2]);
    useAppStore.getState().setSelectionPaint(paint);
    useAppStore.getState().setClassificationVariables(["a", "b"]);
    useAppStore.getState().setClassificationGridResolution(3);
    useAppStore.getState().runClassification();
    await tick();

    const c = useAppStore.getState().classification;
    expect(c.error).toBeNull();
    expect(c.boundaryPaint).not.toBeNull();
    expect(c.gridSize).toBe(9);
    expect(c.running).toBe(false);
  });

  it("clearClassification trims df and hides boundaries, keeps model", async () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([0, 0.1, 10, 10.1])),
      makeNumericColumn("b", new Float64Array([0, 0.1, 10, 10.1])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSelectionPaint(new Uint8Array([1, 1, 2, 2]));
    useAppStore.getState().setClassificationVariables(["a", "b"]);
    useAppStore.getState().setClassificationGridResolution(3);
    useAppStore.getState().runClassification();
    await tick();
    useAppStore.getState().applyClassificationBoundaries();
    expect(useAppStore.getState().classification.boundariesVisible).toBe(true);
    const extendedN = useAppStore.getState().df!.nrow;
    expect(extendedN).toBeGreaterThan(df.nrow);

    useAppStore.getState().clearClassification();
    const c = useAppStore.getState().classification;
    expect(c.boundariesVisible).toBe(false);
    expect(c.predictions).not.toBeNull();
    expect(c.boundaryPaint).not.toBeNull();
    expect(useAppStore.getState().df!.nrow).toBe(df.nrow);
  });

  it("resetClassification resets all state", () => {
    useAppStore.getState().setClassificationMethod("randomforest");
    useAppStore.getState().setClassificationVariables(["x", "y"]);
    useAppStore.getState().setClassificationKnnK(10);
    useAppStore.getState().resetClassification();
    const c = useAppStore.getState().classification;
    expect(c.method).toBe("knn");
    expect(c.variables).toEqual([]);
    expect(c.knnK).toBe(5);
  });

  it("runClassification produces boundaryProbabilities with painted groups", async () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([0, 0.1, 10, 10.1])),
      makeNumericColumn("b", new Float64Array([0, 0.1, 10, 10.1])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSelectionPaint(new Uint8Array([1, 1, 2, 2]));
    useAppStore.getState().setClassificationVariables(["a", "b"]);
    useAppStore.getState().setClassificationGridResolution(3);
    useAppStore.getState().runClassification();
    await tick();

    const c = useAppStore.getState().classification;
    expect(c.boundaryProbabilities).not.toBeNull();
    expect(c.boundaryProbabilities!.length).toBe(c.gridSize);
    for (let i = 0; i < c.gridSize; i++) {
      const p = c.boundaryProbabilities![i]!;
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it("applyClassificationBoundaries extends df with boundary rows and sets shapes", async () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([0, 0.1, 10, 10.1])),
      makeNumericColumn("b", new Float64Array([0, 0.1, 10, 10.1])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSelectionPaint(new Uint8Array([1, 1, 2, 2]));
    useAppStore.getState().setClassificationVariables(["a", "b"]);
    useAppStore.getState().setClassificationGridResolution(4);
    useAppStore.getState().runClassification();
    await tick();

    const origN = df.nrow;
    const gridSz = useAppStore.getState().classification.gridSize;
    expect(gridSz).toBeGreaterThan(0);
    expect(useAppStore.getState().classification.boundaryPaint).not.toBeNull();
    expect(useAppStore.getState().classification.boundaryMins).not.toBeNull();

    useAppStore.getState().applyClassificationBoundaries();
    const state = useAppStore.getState();
    expect(state.df!.nrow).toBeGreaterThan(origN);
    expect(state.classification.boundaryNOrig).toBe(origN);
    expect(state.color.encoding.kind).toBe("paint");
    expect(state.classification.boundariesVisible).toBe(true);

    for (let i = origN; i < state.df!.nrow; i++) {
      expect(state.selection.shape[i]).toBe(6);
    }
  });

  it("clearClassification trims df back to original rows", async () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([0, 0.1, 10, 10.1])),
      makeNumericColumn("b", new Float64Array([0, 0.1, 10, 10.1])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSelectionPaint(new Uint8Array([1, 1, 2, 2]));
    useAppStore.getState().setClassificationVariables(["a", "b"]);
    useAppStore.getState().setClassificationGridResolution(3);
    useAppStore.getState().runClassification();
    await tick();
    useAppStore.getState().applyClassificationBoundaries();
    const extendedN = useAppStore.getState().df!.nrow;
    expect(extendedN).toBeGreaterThan(df.nrow);

    useAppStore.getState().clearClassification();
    expect(useAppStore.getState().df!.nrow).toBe(df.nrow);
    expect(useAppStore.getState().classification.boundariesVisible).toBe(false);
    expect(useAppStore.getState().classification.boundaryNOrig).toBe(0);
  });

  it("runClassification works with categorical class source", async () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([0, 0.1, 10, 10.1])),
      makeNumericColumn("b", new Float64Array([0, 0.1, 10, 10.1])),
      makeCategoricalColumn("group", new Int32Array([0, 0, 1, 1]), ["A", "B"]),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setClassificationClassSource("group");
    useAppStore.getState().setClassificationVariables(["a", "b"]);
    useAppStore.getState().setClassificationGridResolution(3);
    useAppStore.getState().runClassification();
    await tick();

    const c = useAppStore.getState().classification;
    expect(c.error).toBeNull();
    expect(c.boundaryPaint).not.toBeNull();
    expect(c.predictions).not.toBeNull();
    expect(c.classToPaint).not.toBeNull();
    expect(c.classSource).toBe("group");
  });

  it("runClassification produces misclassified array and predictions", async () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([0, 0.1, 10, 10.1])),
      makeNumericColumn("b", new Float64Array([0, 0.1, 10, 10.1])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSelectionPaint(new Uint8Array([1, 1, 2, 2]));
    useAppStore.getState().setClassificationVariables(["a", "b"]);
    useAppStore.getState().runClassification();
    await tick();

    const c = useAppStore.getState().classification;
    expect(c.predictions).not.toBeNull();
    expect(c.misclassified).not.toBeNull();
    expect(c.predictions!.length).toBe(df.nrow);
    expect(c.misclassified!.length).toBe(df.nrow);
  });

  it("applyClassificationBoundaries sets misclassified shape and paint encoding", async () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([0, 5, 10])),
      makeNumericColumn("b", new Float64Array([0, 5, 10])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSelectionPaint(new Uint8Array([1, 1, 2]));
    useAppStore.getState().setClassificationVariables(["a", "b"]);
    useAppStore.getState().setClassificationGridResolution(2);
    useAppStore.getState().runClassification();
    await tick();
    useAppStore.getState().applyClassificationBoundaries();
    const state = useAppStore.getState();
    const s = state.selection;
    for (let i = 0; i < 3; i++) {
      if (useAppStore.getState().classification.misclassified![i]) {
        expect(s.shape[i]).toBe(5);
      }
    }
    expect(state.color.encoding.kind).toBe("paint");
  });
});
