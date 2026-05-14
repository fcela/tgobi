import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeNumericColumn } from "@/lib/data/columns";

beforeEach(() => {
  useAppStore.getState().clear();
  useAppStore.getState().resetSelectionFor(0);
  useAppStore.getState().clearClustering();
});

describe("ClusteringSlice", () => {
  it("defaults", () => {
    const c = useAppStore.getState().clustering;
    expect(c.method).toBe("kmeans");
    expect(c.variables).toEqual([]);
    expect(c.k).toBe(3);
    expect(c.linkage).toBe("complete");
    expect(c.eps).toBe(1);
    expect(c.minPts).toBe(5);
    expect(c.xi).toBe(0.05);
    expect(c.kMax).toBe(10);
    expect(c.results).toBeNull();
    expect(c.sizes).toEqual([]);
    expect(c.running).toBe(false);
    expect(c.error).toBeNull();
  });

  it("setClusteringMethod clears results", () => {
    useAppStore.getState().setClusteringMethod("hierarchical");
    const c = useAppStore.getState().clustering;
    expect(c.method).toBe("hierarchical");
    expect(c.results).toBeNull();
  });

  it("setClusteringMethod to dbscan", () => {
    useAppStore.getState().setClusteringMethod("dbscan");
    expect(useAppStore.getState().clustering.method).toBe("dbscan");
  });

  it("setClusteringVariables clears results", () => {
    useAppStore.getState().setClusteringVariables(["x", "y"]);
    expect(useAppStore.getState().clustering.variables).toEqual(["x", "y"]);
    expect(useAppStore.getState().clustering.results).toBeNull();
  });

  it("setClusteringK clears results", () => {
    useAppStore.getState().setClusteringK(5);
    expect(useAppStore.getState().clustering.k).toBe(5);
    expect(useAppStore.getState().clustering.results).toBeNull();
  });

  it("setClusteringLinkage clears results", () => {
    useAppStore.getState().setClusteringLinkage("single");
    expect(useAppStore.getState().clustering.linkage).toBe("single");
    expect(useAppStore.getState().clustering.results).toBeNull();
  });

  it("setClusteringEps clears results", () => {
    useAppStore.getState().setClusteringEps(2.5);
    expect(useAppStore.getState().clustering.eps).toBe(2.5);
    expect(useAppStore.getState().clustering.results).toBeNull();
  });

  it("setClusteringMinPts clears results", () => {
    useAppStore.getState().setClusteringMinPts(3);
    expect(useAppStore.getState().clustering.minPts).toBe(3);
    expect(useAppStore.getState().clustering.results).toBeNull();
  });

  it("setClusteringXi clears results", () => {
    useAppStore.getState().setClusteringXi(0.1);
    expect(useAppStore.getState().clustering.xi).toBe(0.1);
    expect(useAppStore.getState().clustering.results).toBeNull();
  });

  it("setClusteringKMax clears results", () => {
    useAppStore.getState().setClusteringKMax(15);
    expect(useAppStore.getState().clustering.kMax).toBe(15);
    expect(useAppStore.getState().clustering.results).toBeNull();
  });

  it("runClustering with no data sets error", () => {
    useAppStore.getState().setClusteringVariables(["x", "y"]);
    useAppStore.getState().runClustering();
    expect(useAppStore.getState().clustering.error).toBeTruthy();
    expect(useAppStore.getState().clustering.results).toBeNull();
  });

  it("runClustering with kmeans produces assignments", () => {
    const x = new Float64Array([0, 0, 0, 10, 10, 10]);
    const y = new Float64Array([0, 0, 0, 10, 10, 10]);
    const df = new ArrayDataFrame([
      makeNumericColumn("x", x),
      makeNumericColumn("y", y),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().resetSelectionFor(6);
    useAppStore.getState().setClusteringVariables(["x", "y"]);
    useAppStore.getState().setClusteringK(2);
    useAppStore.getState().runClustering();

    const c = useAppStore.getState().clustering;
    expect(c.error).toBeNull();
    expect(c.results).not.toBeNull();
    expect(c.results!.length).toBe(6);
    expect(c.sizes.length).toBe(2);
    expect(c.sizes.reduce((a, b) => a + b, 0)).toBe(6);
  });

  it("runClustering with hierarchical produces assignments", () => {
    const x = new Float64Array([0, 0, 0, 10, 10, 10]);
    const y = new Float64Array([0, 0, 0, 10, 10, 10]);
    const df = new ArrayDataFrame([
      makeNumericColumn("x", x),
      makeNumericColumn("y", y),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().resetSelectionFor(6);
    useAppStore.getState().setClusteringMethod("hierarchical");
    useAppStore.getState().setClusteringVariables(["x", "y"]);
    useAppStore.getState().setClusteringK(2);
    useAppStore.getState().runClustering();

    const c = useAppStore.getState().clustering;
    expect(c.error).toBeNull();
    expect(c.results).not.toBeNull();
    expect(c.results!.length).toBe(6);
  });

  it("runClustering with dbscan produces assignments", () => {
    const x = new Float64Array([0, 0, 0, 10, 10, 10]);
    const y = new Float64Array([0, 0, 0, 10, 10, 10]);
    const df = new ArrayDataFrame([
      makeNumericColumn("x", x),
      makeNumericColumn("y", y),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().resetSelectionFor(6);
    useAppStore.getState().setClusteringMethod("dbscan");
    useAppStore.getState().setClusteringEps(5);
    useAppStore.getState().setClusteringMinPts(2);
    useAppStore.getState().setClusteringVariables(["x", "y"]);
    useAppStore.getState().runClustering();

    const c = useAppStore.getState().clustering;
    expect(c.error).toBeNull();
    expect(c.results).not.toBeNull();
    expect(c.results!.length).toBe(6);
    expect(c.sizes.length).toBeGreaterThanOrEqual(1);
  });

  it("applyClusteringPaint sets paint array from cluster assignments", () => {
    const x = new Float64Array([0, 0, 0, 10, 10, 10]);
    const y = new Float64Array([0, 0, 0, 10, 10, 10]);
    const df = new ArrayDataFrame([
      makeNumericColumn("x", x),
      makeNumericColumn("y", y),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().resetSelectionFor(6);
    useAppStore.getState().setClusteringVariables(["x", "y"]);
    useAppStore.getState().setClusteringK(2);
    useAppStore.getState().runClustering();
    useAppStore.getState().applyClusteringPaint();

    const paint = useAppStore.getState().selection.paint;
    expect(paint.length).toBe(6);
    const c0 = useAppStore.getState().clustering.results![0]!;
    const c3 = useAppStore.getState().clustering.results![3]!;
    expect(paint[0]).toBe(c0 + 1);
    expect(paint[3]).toBe(c3 + 1);
  });

  it("clearClustering resets results and error", () => {
    useAppStore.getState().setClusteringVariables(["x", "y"]);
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([0, 10])),
      makeNumericColumn("y", new Float64Array([0, 10])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().resetSelectionFor(2);
    useAppStore.getState().runClustering();
    expect(useAppStore.getState().clustering.results).not.toBeNull();

    useAppStore.getState().clearClustering();
    expect(useAppStore.getState().clustering.results).toBeNull();
    expect(useAppStore.getState().clustering.sizes).toEqual([]);
    expect(useAppStore.getState().clustering.error).toBeNull();
  });

  it("runClustering with < 2 variables sets error", () => {
    const df = new ArrayDataFrame([makeNumericColumn("x", new Float64Array([1, 2, 3]))]);
    useAppStore.getState().setData(df);
    useAppStore.getState().resetSelectionFor(3);
    useAppStore.getState().setClusteringVariables(["x"]);
    useAppStore.getState().runClustering();
    expect(useAppStore.getState().clustering.error).toBeTruthy();
  });

  it("runClustering with optics produces assignments", () => {
    const x = new Float64Array([0, 0, 0, 10, 10, 10]);
    const y = new Float64Array([0, 0, 0, 10, 10, 10]);
    const df = new ArrayDataFrame([
      makeNumericColumn("x", x),
      makeNumericColumn("y", y),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().resetSelectionFor(6);
    useAppStore.getState().setClusteringMethod("optics");
    useAppStore.getState().setClusteringEps(5);
    useAppStore.getState().setClusteringMinPts(2);
    useAppStore.getState().setClusteringVariables(["x", "y"]);
    useAppStore.getState().runClustering();

    const c = useAppStore.getState().clustering;
    expect(c.error).toBeNull();
    expect(c.results).not.toBeNull();
    expect(c.results!.length).toBe(6);
  });

  it("runClustering with xmeans produces assignments", () => {
    const x = new Float64Array([0, 0, 0, 10, 10, 10]);
    const y = new Float64Array([0, 0, 0, 10, 10, 10]);
    const df = new ArrayDataFrame([
      makeNumericColumn("x", x),
      makeNumericColumn("y", y),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().resetSelectionFor(6);
    useAppStore.getState().setClusteringMethod("xmeans");
    useAppStore.getState().setClusteringKMax(5);
    useAppStore.getState().setClusteringVariables(["x", "y"]);
    useAppStore.getState().runClustering();

    const c = useAppStore.getState().clustering;
    expect(c.error).toBeNull();
    expect(c.results).not.toBeNull();
    expect(c.results!.length).toBe(6);
    expect(c.k).toBeGreaterThanOrEqual(1);
    expect(c.k).toBeLessThanOrEqual(5);
  });
});
