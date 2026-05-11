import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeNumericColumn } from "@/lib/data/columns";
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
