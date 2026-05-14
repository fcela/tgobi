import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeCategoricalColumn, makeNumericColumn } from "@/lib/data/columns";
import { bitGet } from "@/lib/brush/hitTest";

beforeEach(() => useAppStore.getState().clear());

describe("DataSlice", () => {
  it("starts empty", () => {
    const s = useAppStore.getState();
    expect(s.df).toBeNull();
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
  });

  it("setData clears error and loading", () => {
    useAppStore.getState().setLoading(true);
    useAppStore.getState().setError("boom");
    const df = new ArrayDataFrame([makeNumericColumn("x", new Float64Array([1, 2]))]);
    useAppStore.getState().setData(df);
    const s = useAppStore.getState();
    expect(s.df).toBe(df);
    expect(s.error).toBeNull();
    expect(s.loading).toBe(false);
  });

  it("setError clears loading", () => {
    useAppStore.getState().setLoading(true);
    useAppStore.getState().setError("nope");
    expect(useAppStore.getState().loading).toBe(false);
    expect(useAppStore.getState().error).toBe("nope");
  });

  it("deriveColumn appends a derived variable without clearing panels or selection", () => {
    const df = new ArrayDataFrame([makeNumericColumn("x", new Float64Array([1, 2, 4]))]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSpec([{ name: "x", type: "numeric", included: true }]);
    useAppStore.getState().addScatter("x", "x");
    useAppStore.getState().deriveColumn("log_x", { kind: "log", source: "x" });

    const s = useAppStore.getState();
    expect(s.df?.column("log_x")?.type).toBe("numeric");
    expect(s.spec.find((v) => v.name === "log_x")).toMatchObject({
      name: "log_x",
      type: "numeric",
      included: true,
      derived: { kind: "log", source: "x" },
    });
    expect(s.plots.panels).toHaveLength(1);
    expect(s.selection.paint).toHaveLength(3);
  });

  it("deriveColumn can jitter categorical source codes", () => {
    const df = new ArrayDataFrame([
      makeCategoricalColumn("g", new Int32Array([0, 1, 0]), ["a", "b"]),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSpec([{ name: "g", type: "categorical", included: true }]);
    useAppStore.getState().deriveColumn("jitter_g", { kind: "jitter", source: "g", amplitude: 0, seed: 4 });

    const col = useAppStore.getState().df?.column("jitter_g");
    expect(col?.type).toBe("numeric");
    if (col?.type === "numeric") expect(Array.from(col.values)).toEqual([0, 1, 0]);
  });

  it("deriveSphere appends a sphered variable group without clearing panels or selection", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2, 3, 5])),
      makeNumericColumn("y", new Float64Array([1, 4, 2, 7])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setSpec([
      { name: "x", type: "numeric", included: true },
      { name: "y", type: "numeric", included: true },
    ]);
    useAppStore.getState().addScatter("x", "y");
    useAppStore.getState().deriveSphere("sphere", ["x", "y"]);

    const s = useAppStore.getState();
    expect(s.df?.column("sphere_x")?.type).toBe("numeric");
    expect(s.df?.column("sphere_y")?.type).toBe("numeric");
    expect(s.spec.find((v) => v.name === "sphere_x")).toMatchObject({
      name: "sphere_x",
      type: "numeric",
      included: true,
      derived: { kind: "sphere", sources: ["x", "y"], component: 0, prefix: "sphere" },
    });
    expect(s.spec.find((v) => v.name === "sphere_y")).toMatchObject({
      name: "sphere_y",
      type: "numeric",
      included: true,
      derived: { kind: "sphere", sources: ["x", "y"], component: 1, prefix: "sphere" },
    });
    expect(s.plots.panels).toHaveLength(1);
    expect(s.selection.paint).toHaveLength(4);
  });
});

describe("DataSlice.setData side-effects (M2)", () => {
  it("resets selection layers and clears panels", () => {
    useAppStore.getState().resetSelectionFor(0);
    useAppStore.getState().resetIdentifyFor(3);
    useAppStore.getState().togglePinnedIdentify(1);
    useAppStore.getState().clearPanels();
    useAppStore.getState().addScatter("x", "y");
    const df = new ArrayDataFrame([makeNumericColumn("x", new Float64Array([1, 2, 3]))]);
    useAppStore.getState().setData(df);
    const s = useAppStore.getState();
    expect(s.selection.mask.length).toBe(Math.ceil(3 / 8));
    expect(s.selection.paint.length).toBe(3);
    expect(s.selection.shape.length).toBe(3);
    expect(s.selection.shadow.length).toBe(Math.ceil(3 / 8));
    expect(s.tools.pinnedRows.length).toBe(Math.ceil(3 / 8));
    expect(bitGet(s.tools.pinnedRows, 1)).toBe(false);
    expect(s.plots.panels).toHaveLength(0);
  });
});
