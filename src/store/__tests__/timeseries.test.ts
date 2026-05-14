import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeNumericColumn } from "@/lib/data/columns";

beforeEach(() => useAppStore.getState().clear());

describe("addTimeseries", () => {
  it("appends a timeseries panel with correct fields", () => {
    const df = new ArrayDataFrame([makeNumericColumn("t", new Float64Array([1, 2, 3])), makeNumericColumn("y", new Float64Array([10, 20, 30]))]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSpec([
      { name: "t", type: "numeric", included: true },
      { name: "y", type: "numeric", included: true },
    ]);
    const id = useAppStore.getState().addTimeseries("t", ["y"]);
    const panel = useAppStore.getState().plots.panels.find((p) => p.id === id);
    expect(panel).toBeDefined();
    expect(panel!.kind).toBe("timeseries");
    if (panel!.kind === "timeseries") {
      expect(panel!.x).toBe("t");
      expect(panel!.y).toEqual(["y"]);
      expect(panel!.groupVar).toBeNull();
      expect(panel!.display).toBe("points+lines");
    }
  });

  it("throws if no y variables provided", () => {
    const df = new ArrayDataFrame([makeNumericColumn("t", new Float64Array([1, 2, 3]))]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSpec([{ name: "t", type: "numeric", included: true }]);
    expect(() => useAppStore.getState().addTimeseries("t", [])).toThrow("need at least 1 y variable");
  });

  it("accepts multiple y variables and group var", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("t", new Float64Array([1, 2, 3])),
      makeNumericColumn("a", new Float64Array([10, 20, 30])),
      makeNumericColumn("b", new Float64Array([5, 15, 25])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSpec([
      { name: "t", type: "numeric", included: true },
      { name: "a", type: "numeric", included: true },
      { name: "b", type: "numeric", included: true },
    ]);
    const id = useAppStore.getState().addTimeseries("t", ["a", "b"], "catVar", "lines");
    const panel = useAppStore.getState().plots.panels.find((p) => p.id === id);
    if (panel!.kind === "timeseries") {
      expect(panel!.y).toEqual(["a", "b"]);
      expect(panel!.groupVar).toBe("catVar");
      expect(panel!.display).toBe("lines");
    }
  });

  it("creates a tile leaf for the panel", () => {
    const df = new ArrayDataFrame([makeNumericColumn("t", new Float64Array([1, 2])), makeNumericColumn("y", new Float64Array([10, 20]))]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSpec([{ name: "t", type: "numeric", included: true }, { name: "y", type: "numeric", included: true }]);
    useAppStore.getState().addTimeseries("t", ["y"]);
    const root = useAppStore.getState().plots.root;
    expect(root).not.toBeNull();
  });
});

describe("setTimeseriesViewport", () => {
  it("updates viewport on a timeseries panel", () => {
    const df = new ArrayDataFrame([makeNumericColumn("t", new Float64Array([1, 2])), makeNumericColumn("y", new Float64Array([10, 20]))]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSpec([{ name: "t", type: "numeric", included: true }, { name: "y", type: "numeric", included: true }]);
    const id = useAppStore.getState().addTimeseries("t", ["y"]);
    useAppStore.getState().setTimeseriesViewport(id, { xMin: 0, xMax: 10, yMin: -5, yMax: 50 });
    const panel = useAppStore.getState().plots.panels.find((p) => p.id === id);
    if (panel!.kind === "timeseries") {
      expect(panel!.viewport).toEqual({ xMin: 0, xMax: 10, yMin: -5, yMax: 50 });
    }
  });

  it("clears viewport when null is passed", () => {
    const df = new ArrayDataFrame([makeNumericColumn("t", new Float64Array([1, 2])), makeNumericColumn("y", new Float64Array([10, 20]))]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSpec([{ name: "t", type: "numeric", included: true }, { name: "y", type: "numeric", included: true }]);
    const id = useAppStore.getState().addTimeseries("t", ["y"]);
    useAppStore.getState().setTimeseriesViewport(id, { xMin: 0, xMax: 10, yMin: -5, yMax: 50 });
    useAppStore.getState().setTimeseriesViewport(id, null);
    const panel = useAppStore.getState().plots.panels.find((p) => p.id === id);
    if (panel!.kind === "timeseries") {
      expect(panel!.viewport).toBeNull();
    }
  });
});

describe("setTimeseriesDisplay", () => {
  it("updates display mode on a timeseries panel", () => {
    const df = new ArrayDataFrame([makeNumericColumn("t", new Float64Array([1, 2])), makeNumericColumn("y", new Float64Array([10, 20]))]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSpec([{ name: "t", type: "numeric", included: true }, { name: "y", type: "numeric", included: true }]);
    const id = useAppStore.getState().addTimeseries("t", ["y"]);
    useAppStore.getState().setTimeseriesDisplay(id, "lines");
    const panel = useAppStore.getState().plots.panels.find((p) => p.id === id);
    if (panel!.kind === "timeseries") {
      expect(panel!.display).toBe("lines");
    }
  });
});
