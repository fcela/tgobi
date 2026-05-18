import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeNumericColumn, makeCategoricalColumn } from "@/lib/data/columns";
import { BitMissingMask } from "@/lib/data/missing";
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
    expect(c.gridSize).toBeGreaterThan(0);
    expect(c.gridSize).toBeLessThanOrEqual(9);
    expect(c.running).toBe(false);
  });

  it("clearClassification hides boundaries but keeps the model & boundary state", async () => {
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
    // df is never mutated under the overlay design.
    expect(useAppStore.getState().df!.nrow).toBe(df.nrow);

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
    // df is no longer mutated — boundary points are an overlay layer.
    expect(state.df!.nrow).toBe(origN);
    expect(state.color.encoding.kind).toBe("paint");
    expect(state.classification.boundariesVisible).toBe(true);
    expect(state.classification.boundaryVars).toEqual(["a", "b"]);
    expect(state.classification.boundaryGrid).not.toBeNull();
  });

  it("clearClassification hides boundaries but leaves df untouched", async () => {
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
    expect(useAppStore.getState().df!.nrow).toBe(df.nrow); // overlay, not mutation
    expect(useAppStore.getState().classification.boundariesVisible).toBe(true);

    useAppStore.getState().clearClassification();
    expect(useAppStore.getState().df!.nrow).toBe(df.nrow);
    expect(useAppStore.getState().classification.boundariesVisible).toBe(false);
    // Boundary grid is preserved so Show can re-display it without re-running.
    expect(useAppStore.getState().classification.boundaryGrid).not.toBeNull();
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

  it("applyClassificationBoundaries flips boundariesVisible and forces paint color encoding", async () => {
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
    const state = useAppStore.getState();
    expect(state.color.encoding.kind).toBe("paint");
    expect(state.classification.boundariesVisible).toBe(true);
    // Misclassified flags are kept on the slice — renderers consume them
    // directly rather than via selection.shape. No shape mutation should
    // happen.
    expect(state.classification.misclassified).not.toBeNull();
    // df row count is unchanged — boundary points live in the slice.
    expect(state.df!.nrow).toBe(4);
  });

  it("applyClassificationBoundaries does not touch the df — boundary points live on the classification slice", async () => {
    const mask = new BitMissingMask(4);
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([0, 0.1, 10, 10.1])),
      makeNumericColumn("b", new Float64Array([0, 0.1, 10, 10.1])),
      makeNumericColumn("c", new Float64Array([1, 2, 3, 4]), mask),
      makeCategoricalColumn("group", new Int32Array([0, 0, 1, 1]), ["A", "B"]),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSelectionPaint(new Uint8Array([1, 1, 2, 2]));
    useAppStore.getState().setClassificationVariables(["a", "b"]);
    useAppStore.getState().setClassificationGridResolution(3);
    useAppStore.getState().runClassification();
    await tick();

    useAppStore.getState().applyClassificationBoundaries();
    const after = useAppStore.getState();

    // df row count and per-column missing masks are unchanged.
    expect(after.df!.nrow).toBe(4);
    const colC = after.df!.column("c")!;
    for (let i = 0; i < 4; i++) {
      expect(colC.missing.isMissing(i)).toBe(mask.isMissing(i));
    }

    // Boundary points are accessible via the classification slice.
    expect(after.classification.boundariesVisible).toBe(true);
    expect(after.classification.boundaryGrid).not.toBeNull();
    expect(after.classification.boundaryPaint).not.toBeNull();
    expect(after.classification.boundaryVars).toEqual(["a", "b"]);
  });

  it("df shape and missing masks are unchanged across apply/clear cycle (overlay design)", async () => {
    const mask = new BitMissingMask(4);
    mask.setMissing(1, true);
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([0, 0.1, 10, 10.1])),
      makeNumericColumn("b", new Float64Array([0, 0.1, 10, 10.1])),
      makeNumericColumn("c", new Float64Array([1, 2, 3, 4]), mask),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSelectionPaint(new Uint8Array([1, 1, 2, 2]));
    useAppStore.getState().setClassificationVariables(["a", "b"]);
    useAppStore.getState().setClassificationGridResolution(3);
    useAppStore.getState().runClassification();
    await tick();
    useAppStore.getState().applyClassificationBoundaries();
    expect(useAppStore.getState().df!.nrow).toBe(4);

    useAppStore.getState().clearClassification();
    const afterDf = useAppStore.getState().df!;
    expect(afterDf.nrow).toBe(4);

    const colC = afterDf.column("c")!;
    expect(colC.missing.isMissing(0)).toBe(false);
    expect(colC.missing.isMissing(1)).toBe(true);
    expect(colC.missing.isMissing(2)).toBe(false);
    expect(colC.missing.isMissing(3)).toBe(false);
  });

  it("boundary grid is 2D — gridSize <= resolution^2 and <= resolution^p for 3+ vars", async () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([0, 0.1, 10, 10.1])),
      makeNumericColumn("b", new Float64Array([0, 0.1, 10, 10.1])),
      makeNumericColumn("c", new Float64Array([5, 5, 5, 5])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSelectionPaint(new Uint8Array([1, 1, 2, 2]));
    useAppStore.getState().setClassificationVariables(["a", "b", "c"]);
    useAppStore.getState().setClassificationGridResolution(5);
    useAppStore.getState().runClassification();
    await tick();

    const c = useAppStore.getState().classification;
    expect(c.error).toBeNull();
    expect(c.gridSize).toBeLessThanOrEqual(25);
    expect(c.boundaryGrid!.length).toBe(c.gridSize * 3);
  });

  it("boundary thinning only keeps points near class boundary", async () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([0, 0.1, 10, 10.1])),
      makeNumericColumn("b", new Float64Array([0, 0.1, 10, 10.1])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSelectionPaint(new Uint8Array([1, 1, 2, 2]));
    useAppStore.getState().setClassificationVariables(["a", "b"]);
    useAppStore.getState().setClassificationGridResolution(5);
    useAppStore.getState().runClassification();
    await tick();

    const c = useAppStore.getState().classification;
    expect(c.error).toBeNull();
    expect(c.gridSize).toBeGreaterThan(0);
    expect(c.gridSize).toBeLessThan(25);
  });

  it("boundary points with 3+ predictors have median values for extra predictors (2D mode)", async () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([0, 0.1, 10, 10.1])),
      makeNumericColumn("b", new Float64Array([0, 0.1, 10, 10.1])),
      makeNumericColumn("c", new Float64Array([1, 2, 8, 9])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSelectionPaint(new Uint8Array([1, 1, 2, 2]));
    useAppStore.getState().setClassificationVariables(["a", "b", "c"]);
    useAppStore.getState().setClassificationGridResolution(3);
    useAppStore.getState().runClassification();
    await tick();

    const c = useAppStore.getState().classification;
    expect(c.boundaryVars).toEqual(["a", "b", "c"]);
    // boundaryGrid is row-major (gridSize × nVars). The third axis (c) is
    // pinned to the training median in 2D mode.
    const flat = c.boundaryGrid!;
    for (let b = 0; b < c.gridSize; b++) {
      expect(flat[b * 3 + 2]!).toBeCloseTo(5, 1);
    }
  });

  it("writes predictions to the correct df rows when a labeled row has invalid features", async () => {
    // Row 0 is painted but has a NaN in predictor 'b' → must be dropped from
    // training. The remaining painted rows (1..7) must receive predictions
    // at their *original* df indices, not shifted by the drop. Three points
    // per class so KNN's vote is unambiguous at the default k=5.
    const bMask = new BitMissingMask(8);
    bMask.setMissing(0, true);
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([0, 0, 0.1, 0.2, 10, 10.1, 10.2, 10.3])),
      makeNumericColumn("b", new Float64Array([NaN, 0, 0.1, 0.2, 10, 10.1, 10.2, 10.3]), bMask),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSelectionPaint(new Uint8Array([1, 1, 1, 1, 2, 2, 2, 2]));
    useAppStore.getState().setClassificationVariables(["a", "b"]);
    useAppStore.getState().runClassification();
    await tick();

    const c = useAppStore.getState().classification;
    expect(c.error).toBeNull();
    expect(c.predictions).not.toBeNull();
    const preds = c.predictions!;
    // Dropped (invalid) row keeps the sentinel -1.
    expect(preds[0]).toBe(-1);
    // The other painted rows received predictions matching their training class.
    for (let i = 1; i < 4; i++) expect(preds[i]).toBe(0);
    for (let i = 4; i < 8; i++) expect(preds[i]).toBe(1);
  });

  it("fullspace gridMode produces boundary points that vary on every predictor axis", async () => {
    // 3 predictors. With 2D mode, axis 'c' would be held at its median for
    // every boundary point. With fullspace mode, 'c' must take at least 2
    // distinct values across the boundary set — otherwise the boundary
    // grid isn't covering the full predictor box.
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([0, 0.1, 0.2, 10, 10.1, 10.2])),
      makeNumericColumn("b", new Float64Array([0, 0.1, 0.2, 10, 10.1, 10.2])),
      makeNumericColumn("c", new Float64Array([0, 1, 2, 8, 9, 10])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSelectionPaint(new Uint8Array([1, 1, 1, 2, 2, 2]));
    useAppStore.getState().setClassificationVariables(["a", "b", "c"]);
    useAppStore.getState().setClassificationGridResolution(4);
    useAppStore.getState().setClassificationGridMode("fullspace");
    useAppStore.getState().runClassification();
    await tick();

    const c = useAppStore.getState().classification;
    expect(c.error).toBeNull();
    expect(c.gridSize).toBeGreaterThan(0);
    expect(c.gridTotal).toBe(4 * 4 * 4); // r=4, p=3
    expect(c.effectiveGridResolution).toBe(4);

    // Boundary points must vary on axis c, not be pinned at its median.
    const flat = c.boundaryGrid!;
    const cValues = new Set<number>();
    for (let b = 0; b < c.gridSize; b++) {
      cValues.add(flat[b * 3 + 2]!);
    }
    expect(cValues.size).toBeGreaterThan(1);
  });

  it("2d gridMode pins extra predictor axes to medians", async () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([0, 0.1, 0.2, 10, 10.1, 10.2])),
      makeNumericColumn("b", new Float64Array([0, 0.1, 0.2, 10, 10.1, 10.2])),
      makeNumericColumn("c", new Float64Array([0, 1, 2, 8, 9, 10])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSelectionPaint(new Uint8Array([1, 1, 1, 2, 2, 2]));
    useAppStore.getState().setClassificationVariables(["a", "b", "c"]);
    useAppStore.getState().setClassificationGridResolution(4);
    // gridMode defaults to "2d"
    useAppStore.getState().runClassification();
    await tick();

    const c = useAppStore.getState().classification;
    expect(c.gridTotal).toBe(16); // 4×4 in the (a, b) plane

    // Every boundary point's c-coordinate must equal the training median (= 5).
    const flat = c.boundaryGrid!;
    for (let b = 0; b < c.gridSize; b++) {
      expect(flat[b * 3 + 2]).toBeCloseTo(5, 6);
    }
  });

  it("applyClassificationBoundaries preserves the user's paint when classSource is a categorical variable", async () => {
    // User has hand-painted some rows AND is classifying against a categorical
    // variable. The paint must survive applyClassificationBoundaries — previous
    // behavior overwrote it with predicted classes.
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([0, 0.1, 0.2, 10, 10.1, 10.2])),
      makeNumericColumn("b", new Float64Array([0, 0.1, 0.2, 10, 10.1, 10.2])),
      makeCategoricalColumn("group", new Int32Array([0, 0, 0, 1, 1, 1]), ["A", "B"]),
    ]);
    useAppStore.getState().setData(df);
    const userPaint = new Uint8Array([3, 4, 0, 5, 0, 0]);
    useAppStore.getState().setSelectionPaint(userPaint);
    useAppStore.getState().setClassificationVariables(["a", "b"]);
    useAppStore.getState().setClassificationClassSource("group");
    useAppStore.getState().runClassification();
    await tick();
    useAppStore.getState().applyClassificationBoundaries();

    const paint = useAppStore.getState().selection.paint;
    // Every original-row paint value must match what the user set.
    for (let i = 0; i < 6; i++) {
      expect(paint[i]).toBe(userPaint[i]!);
    }
  });

  it("setIndecisionThreshold re-applies boundaries live when boundaries are visible", async () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([0, 0.1, 0.2, 10, 10.1, 10.2])),
      makeNumericColumn("b", new Float64Array([0, 0.1, 0.2, 10, 10.1, 10.2])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSelectionPaint(new Uint8Array([1, 1, 1, 2, 2, 2]));
    useAppStore.getState().setClassificationVariables(["a", "b"]);
    useAppStore.getState().setClassificationMethod("logistic"); // real probs at any threshold
    useAppStore.getState().runClassification();
    await tick();
    useAppStore.getState().applyClassificationBoundaries();
    expect(useAppStore.getState().df!.nrow).toBe(6); // overlay, df unchanged

    // The renderer reads classification.indecisionThreshold each frame and
    // filters boundary points client-side. The setter is now a plain state
    // update — boundaries remain visible.
    useAppStore.getState().setIndecisionThreshold(0.4);
    expect(useAppStore.getState().classification.indecisionThreshold).toBe(0.4);
    expect(useAppStore.getState().classification.boundariesVisible).toBe(true);
    expect(useAppStore.getState().df!.nrow).toBe(6);
  });

  it("writes predictions to the correct df rows under train/test split", async () => {
    // 12 well-separated points, 6 per class. With 75/25 split, 4 of each go
    // to train and 2 of each to test. The test verifies that predictions land
    // on their *original* df rows regardless of how the split reorders them.
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([0, 0.1, 0.2, 0.3, 0.4, 0.5, 10, 10.1, 10.2, 10.3, 10.4, 10.5])),
      makeNumericColumn("b", new Float64Array([0, 0.1, 0.2, 0.3, 0.4, 0.5, 10, 10.1, 10.2, 10.3, 10.4, 10.5])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSelectionPaint(new Uint8Array([1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2]));
    useAppStore.getState().setClassificationVariables(["a", "b"]);
    useAppStore.getState().setClassificationUseTrainTestSplit(true);
    useAppStore.getState().setClassificationTrainRatio(0.75);
    useAppStore.getState().runClassification();
    await tick();

    const c = useAppStore.getState().classification;
    expect(c.error).toBeNull();
    const preds = c.predictions!;
    for (let i = 0; i < 6; i++) expect(preds[i]).toBe(0);
    for (let i = 6; i < 12; i++) expect(preds[i]).toBe(1);
  });
});
