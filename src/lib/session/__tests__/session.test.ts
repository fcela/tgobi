import { describe, it, expect } from "vitest";
import { exportSession, importSession } from "@/lib/session/session";
import type { AppStore } from "@/store/types";
import { makeNumericColumn, makeCategoricalColumn } from "@/lib/data/columns";
import { ArrayDataFrame } from "@/lib/data/dataframe";

function makeMockStore(): AppStore {
  const df = new ArrayDataFrame([
    makeNumericColumn("x", Float64Array.from([1, 2, 3])),
    makeNumericColumn("y", Float64Array.from([4, 5, 6])),
    makeCategoricalColumn("cat", Int32Array.from([0, 1, 0]), ["a", "b"]),
  ]);
  return {
    df,
    spec: [
      { name: "x", type: "numeric", included: true },
      { name: "y", type: "numeric", included: true },
      { name: "cat", type: "categorical", included: true },
    ],
    selection: {
      mask: new Uint8Array(1),
      paint: Uint8Array.from([0, 1, 2]),
      shape: Uint8Array.from([0, 0, 0]),
      shadow: new Uint8Array(1),
    },
    brush: {
      mode: "transient",
      tool: "rectangle",
      target: "nodes",
      paintColor: 0,
      paintShape: 0,
      activeRect: null,
      activePath: null,
      activePanelId: null,
    },
    color: { encoding: { kind: "fixed" }, palette: "accent" },
    tools: { active: "brush", hoverRow: null, pinnedRows: new Uint8Array(3), labelVar: null },
    hulls: { colorGroups: false, paintGroups: false, alpha: 0.3 },
    tour: {
      activePanelId: null, shape: "2d", mode: "grand", ppIndex: "holes",
      ppValue: null, isPlaying: false, speed: 1, activeVars: ["x", "y"],
      frozenVars: [], manualVar: null, manualValue: 0, basis: null, proj: null,
      t: 0, savedViews: [], nextViewId: 0, keyframes: [], nextKeyframeId: 0,
      scrubberT: 0, scrubbing: false, langevinStep: 0.01, langevinDiffusion: 0.1,
      ppScoreTrace: [], ppClassSource: "paint",
    },
    missing: {
      imputation: { method: "none", fixedValue: 0, seed: 42, condVar: null },
      showMarginals: false, imputationSets: 1, imputationIndex: 0,
    },
    clustering: {
      method: "kmeans", variables: ["x", "y"], k: 3, linkage: "ward",
      eps: 0.5, minPts: 5, xi: 0.05, kMax: 10,
      results: null, sizes: [], running: false, error: null,
      dendrogram: null, reachability: null, ordering: null,
      silhouetteMean: null, silhouettePerCluster: null, kDistancePlot: null,
    },
    classification: {
      method: "knn", variables: ["x", "y"], classSource: "cat",
      gridResolution: 30, knnK: 5, rfNEstimators: 50, rfMaxDepth: 4,
      lrLambda: 0.01, lrMaxIter: 200, trainRatio: 0.7, useTrainTestSplit: false,
      boundaryPaint: null, boundaryGrid: null, gridSize: 0,
      boundaryMins: null, boundaryMaxs: null, boundariesVisible: false,
      predictions: null, misclassified: null, classToPaint: null,
      running: false, error: null, confusionMatrix: null, classLabels: null,
      accuracy: null, perClassMetrics: null, featureImportance: null,
      preClassifyShape: null, cvResult: null,
    },
    projection: {
      method: "pca", variables: ["x", "y"], nComponents: 2,
      tsnePerplexity: 30, tsneIterations: 500, umapNNeighbors: 15,
      umapMinDist: 0.1, dimX: 1, dimY: 2, embedding: null,
      explainedVar: null, stress: null, loadings: null,
      varImportance: null, running: false, error: null,
      morphEmbeddings: null, morphIndex: 0, morphT: 0,
      morphPlaying: false, quality: null,
    },
    scagnostics: {
      variables: [], results: null, running: false, error: null,
      sortMeasure: "outlying", sortDescending: true,
      filterMeasure: "outlying", filterThreshold: 0,
    },
    mapper: {
      params: { filterVar: null, intervals: 10, overlap: 0.5, clusterK: 3, variables: [] },
      graph: null, running: false, error: null, colorBy: "density", selectedNodeId: null,
    },
    lessons: { activeLessonId: null, activeStep: 0 },
    edges: {
      layer: null, mode: "none", visible: false, alpha: 0.3,
      colorMode: "fixed", colorAttr: null, editMode: "none",
      linkNodesToEdges: true, linkEdgesToNodes: true,
      selection: { mask: new Uint8Array(1), paint: new Uint8Array(3), shadow: new Uint8Array(1) },
    },
    plots: { panels: [], nextId: 0, root: null, nextTileId: 0 },
    saveSession: () => {},
    openSession: async () => {},
  } as unknown as AppStore;
}

describe("session", () => {
  it("round-trips DataFrame through export/import", () => {
    const store = makeMockStore();
    const exported = exportSession(store);
    expect(exported.version).toBe(1);
    expect(exported.data.nrow).toBe(3);
    expect(exported.data.columns.length).toBe(3);

    const { df, state } = importSession(exported);
    expect(df.nrow).toBe(3);
    expect(df.columns.length).toBe(3);
    expect(df.column("x")!.type).toBe("numeric");
    const catCol = df.column("cat")!;
    expect(catCol.type).toBe("categorical");
    if (catCol.type === "categorical") {
      expect(catCol.levels).toEqual(["a", "b"]);
    }
  });

  it("preserves numeric column values through round-trip", () => {
    const store = makeMockStore();
    const exported = exportSession(store);
    const { df } = importSession(exported);
    const xCol = df.column("x")!;
    expect(xCol.type).toBe("numeric");
    if (xCol.type === "numeric") {
      expect(Array.from(xCol.values)).toEqual([1, 2, 3]);
    }
  });

  it("preserves paint groups through round-trip", () => {
    const store = makeMockStore();
    const exported = exportSession(store);
    const { state } = importSession(exported);
    expect(Array.from(state.selection!.paint!)).toEqual([0, 1, 2]);
  });

  it("preserves tour settings through round-trip", () => {
    const store = makeMockStore();
    const exported = exportSession(store);
    const { state } = importSession(exported);
    expect(state.tour!.shape).toBe("2d");
    expect(state.tour!.mode).toBe("grand");
    expect(state.tour!.activeVars).toEqual(["x", "y"]);
  });

  it("preserves clustering settings through round-trip", () => {
    const store = makeMockStore();
    const exported = exportSession(store);
    const { state } = importSession(exported);
    expect(state.clustering!.method).toBe("kmeans");
    expect(state.clustering!.k).toBe(3);
  });

  it("preserves projection settings through round-trip", () => {
    const store = makeMockStore();
    const exported = exportSession(store);
    const { state } = importSession(exported);
    expect(state.projection!.method).toBe("pca");
    expect(state.projection!.nComponents).toBe(2);
  });

  it("round-trips through JSON.stringify/parse", () => {
    const store = makeMockStore();
    const exported = exportSession(store);
    const json = JSON.stringify(exported);
    const parsed = JSON.parse(json);
    const { df } = importSession(parsed);
    expect(df.nrow).toBe(3);
    const xCol = df.column("x")!;
    if (xCol.type === "numeric") {
      expect(Array.from(xCol.values)).toEqual([1, 2, 3]);
    }
  });
});
