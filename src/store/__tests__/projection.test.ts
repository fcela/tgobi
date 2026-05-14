import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeNumericColumn } from "@/lib/data/columns";

const tick = () => new Promise<void>((r) => setTimeout(r, 10));

beforeEach(() => {
  useAppStore.getState().clear();
  useAppStore.getState().clearProjection();
});

describe("ProjectionSlice", () => {
  it("defaults", () => {
    const p = useAppStore.getState().projection;
    expect(p.method).toBe("pca");
    expect(p.variables).toEqual([]);
    expect(p.nComponents).toBe(2);
    expect(p.dimX).toBe(1);
    expect(p.dimY).toBe(2);
    expect(p.embedding).toBeNull();
    expect(p.explainedVar).toBeNull();
    expect(p.stress).toBeNull();
    expect(p.running).toBe(false);
    expect(p.error).toBeNull();
  });

  it("setProjectionMethod updates method and clears results", () => {
    useAppStore.getState().setProjectionMethod("mds");
    expect(useAppStore.getState().projection.method).toBe("mds");
  });

  it("setProjectionVariables updates variables", () => {
    useAppStore.getState().setProjectionVariables(["a", "b"]);
    expect(useAppStore.getState().projection.variables).toEqual(["a", "b"]);
  });

  it("setProjectionNComponents updates nComponents", () => {
    useAppStore.getState().setProjectionNComponents(3);
    expect(useAppStore.getState().projection.nComponents).toBe(3);
  });

  it("runProjection errors without data", () => {
    useAppStore.getState().setProjectionVariables(["a", "b"]);
    useAppStore.getState().runProjection();
    expect(useAppStore.getState().projection.error).toBeTruthy();
  });

  it("runProjection produces embedding with PCA", async () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
      makeNumericColumn("b", new Float64Array([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])),
      makeNumericColumn("c", new Float64Array([5, 4, 3, 2, 1, 0, -1, -2, -3, -4])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setProjectionVariables(["a", "b", "c"]);
    useAppStore.getState().runProjection();
    await tick();

    const p = useAppStore.getState().projection;
    expect(p.error).toBeNull();
    expect(p.embedding).not.toBeNull();
    expect(p.embedding!.length).toBe(10 * p.nComponents);
    expect(p.explainedVar).not.toBeNull();
    expect(p.running).toBe(false);
  });

  it("materializeProjection adds columns and scatter", async () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("a", new Float64Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
      makeNumericColumn("b", new Float64Array([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setProjectionVariables(["a", "b"]);
    useAppStore.getState().runProjection();
    await tick();

    const p = useAppStore.getState().projection;
    expect(p.embedding).not.toBeNull();

    useAppStore.getState().materializeProjection();

    const newDf = useAppStore.getState().df!;
    expect(newDf.nrow).toBe(10);
    expect(newDf.columns.length).toBeGreaterThanOrEqual(4);
    const pcaCol = newDf.column("PCA.1");
    expect(pcaCol).not.toBeNull();

    const panels = useAppStore.getState().plots.panels;
    expect(panels.length).toBe(1);
    expect(panels[0]!.kind).toBe("scatter");
  });

  it("clearProjection resets all state", () => {
    useAppStore.getState().setProjectionMethod("mds");
    useAppStore.getState().setProjectionVariables(["x", "y"]);
    useAppStore.getState().clearProjection();
    const p = useAppStore.getState().projection;
    expect(p.method).toBe("pca");
    expect(p.variables).toEqual([]);
    expect(p.embedding).toBeNull();
  });
});
