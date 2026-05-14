import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeNumericColumn, makeCategoricalColumn } from "@/lib/data/columns";
import { bitGet } from "@/lib/brush/hitTest";

beforeEach(() => {
  useAppStore.getState().clear();
  useAppStore.getState().clearClassification();
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

  it("runClassification produces boundary paint with painted groups", () => {
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

    const c = useAppStore.getState().classification;
    expect(c.error).toBeNull();
    expect(c.boundaryPaint).not.toBeNull();
    expect(c.gridSize).toBe(9);
    expect(c.running).toBe(false);
  });

  it("clearClassification resets all state", () => {
    useAppStore.getState().setClassificationMethod("randomforest");
    useAppStore.getState().setClassificationVariables(["x", "y"]);
    useAppStore.getState().setClassificationKnnK(10);
    useAppStore.getState().clearClassification();
    const c = useAppStore.getState().classification;
    expect(c.method).toBe("knn");
    expect(c.variables).toEqual([]);
    expect(c.knnK).toBe(5);
  });

  it("applyClassificationBoundaries extends df, paint and shadow arrays", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([0, 0.1, 10, 10.1])),
      makeNumericColumn("b", new Float64Array([0, 0.1, 10, 10.1])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSelectionPaint(new Uint8Array([1, 1, 2, 2]));
    useAppStore.getState().setClassificationVariables(["a", "b"]);
    useAppStore.getState().setClassificationGridResolution(2);
    useAppStore.getState().runClassification();

    const origN = df.nrow;
    const gridSz = useAppStore.getState().classification.gridSize;
    useAppStore.getState().applyClassificationBoundaries();
    const state = useAppStore.getState();
    const s = state.selection;
    expect(state.df!.nrow).toBe(origN + gridSz);
    expect(s.paint.length).toBe(origN + gridSz);
    expect(s.shadow.length).toBeGreaterThanOrEqual(Math.ceil((origN + gridSz) / 8));
    for (let i = origN; i < origN + gridSz; i++) {
      expect(s.paint[i]).toBeGreaterThan(0);
      expect(bitGet(s.shadow, i)).toBe(true);
    }
  });

  it("runClassification works with categorical class source", () => {
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

    const c = useAppStore.getState().classification;
    expect(c.error).toBeNull();
    expect(c.boundaryPaint).not.toBeNull();
    expect(c.predictions).not.toBeNull();
    expect(c.classToPaint).not.toBeNull();
    expect(c.classSource).toBe("group");
  });

  it("runClassification produces misclassified array and predictions", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([0, 0.1, 10, 10.1])),
      makeNumericColumn("b", new Float64Array([0, 0.1, 10, 10.1])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSelectionPaint(new Uint8Array([1, 1, 2, 2]));
    useAppStore.getState().setClassificationVariables(["a", "b"]);
    useAppStore.getState().runClassification();

    const c = useAppStore.getState().classification;
    expect(c.predictions).not.toBeNull();
    expect(c.misclassified).not.toBeNull();
    expect(c.predictions!.length).toBe(df.nrow);
    expect(c.misclassified!.length).toBe(df.nrow);
  });

  it("applyClassificationBoundaries marks misclassified points with shape", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([0, 5, 10])),
      makeNumericColumn("b", new Float64Array([0, 5, 10])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSelectionPaint(new Uint8Array([1, 1, 2]));
    useAppStore.getState().setClassificationVariables(["a", "b"]);
    useAppStore.getState().setClassificationGridResolution(2);
    useAppStore.getState().runClassification();
    useAppStore.getState().applyClassificationBoundaries();
    const s = useAppStore.getState().selection;
    for (let i = 0; i < 3; i++) {
      if (useAppStore.getState().classification.misclassified![i]) {
        expect(s.shape[i]).toBe(3);
      }
    }
  });
});
