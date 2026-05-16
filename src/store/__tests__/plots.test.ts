import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";
import type { TileLeaf, TileNode } from "@/store/types";

beforeEach(() => {
  useAppStore.getState().clearPanels();
});

describe("PlotsSlice", () => {
  it("starts with no panels", () => {
    expect(useAppStore.getState().plots.panels).toHaveLength(0);
  });

  it("addScatter appends and returns the new id", () => {
    const id1 = useAppStore.getState().addScatter("x", "y");
    const id2 = useAppStore.getState().addScatter("a", "b");
    expect(id2).toBeGreaterThan(id1);
    const panels = useAppStore.getState().plots.panels;
    expect(panels.map((p) => p.id)).toEqual([id1, id2]);
    expect(panels[0]).toEqual({ id: id1, kind: "scatter", x: "x", y: "y" });
  });

  it("sets and resets scatter viewport state", () => {
    const id = useAppStore.getState().addScatter("x", "y");
    useAppStore.getState().setScatterViewport(id, { xMin: 4, xMax: 1, yMin: 2, yMax: 2 });

    expect(useAppStore.getState().plots.panels[0]).toMatchObject({
      id,
      kind: "scatter",
      viewport: { xMin: 1, xMax: 4, yMin: 2, yMax: 3 },
    });

    useAppStore.getState().setScatterViewport(id, null);
    expect(useAppStore.getState().plots.panels[0]).toMatchObject({ viewport: null });
  });

  it("addBarchart appends a barchart panel", () => {
    const id = useAppStore.getState().addBarchart("species");
    expect(useAppStore.getState().plots.panels[0]).toEqual({
      id,
      kind: "barchart",
      variable: "species",
      bins: 10,
    });
  });

  it("setBarchartBins updates and clamps barchart bins", () => {
    const id = useAppStore.getState().addBarchart("x");
    useAppStore.getState().setBarchartBins(id, 17.8);
    expect(useAppStore.getState().plots.panels[0]).toMatchObject({ bins: 17 });
    useAppStore.getState().setBarchartBins(id, 99);
    expect(useAppStore.getState().plots.panels[0]).toMatchObject({ bins: 40 });
    useAppStore.getState().setBarchartBins(id, 0);
    expect(useAppStore.getState().plots.panels[0]).toMatchObject({ bins: 1 });
  });

  it("addDotplot appends a dotplot panel with default bins=20", () => {
    const id = useAppStore.getState().addDotplot("tars1");
    expect(useAppStore.getState().plots.panels[0]).toEqual({
      id,
      kind: "dotplot",
      variable: "tars1",
      bins: 20,
    });
  });

  it("addScatmat appends a scatmat panel with given variables", () => {
    const id = useAppStore.getState().addScatmat(["a", "b", "c"]);
    expect(useAppStore.getState().plots.panels[0]).toEqual({
      id,
      kind: "scatmat",
      variables: ["a", "b", "c"],
    });
  });

  it("addScatmat throws if fewer than 2 variables", () => {
    expect(() => useAppStore.getState().addScatmat(["a"])).toThrow();
  });

  it("addParcoords appends a parcoords panel with given variables", () => {
    const id = useAppStore.getState().addParcoords(["a", "b", "c"]);
  expect(useAppStore.getState().plots.panels[0]).toEqual({
    id,
    kind: "parcoords",
    variables: ["a", "b", "c"],
    condVar: null,
  });
  });

  it("addParcoords throws if fewer than 2 variables", () => {
    expect(() => useAppStore.getState().addParcoords(["a"])).toThrow();
  });

  it("removePanel by id", () => {
    const id = useAppStore.getState().addScatter("x", "y");
    useAppStore.getState().addScatter("a", "b");
    useAppStore.getState().removePanel(id);
    expect(useAppStore.getState().plots.panels.map((p) => p.id)).not.toContain(id);
  });

  it("moves a panel into another tile as a tab", () => {
    const id1 = useAppStore.getState().addScatter("x", "y");
    const id2 = useAppStore.getState().addScatter("a", "b");
    const root = useAppStore.getState().plots.root;
    const target = collectLeaves(root).find((leaf) => leaf.tabs.includes(id1))!;

    useAppStore.getState().movePanelToTile(id2, target.id, "center");

    const nextRoot = useAppStore.getState().plots.root;
    expect(useAppStore.getState().plots.panels.map((p) => p.id)).toEqual([id1, id2]);
    expect(nextRoot?.type).toBe("leaf");
    expect((nextRoot as TileLeaf).tabs).toEqual([id1, id2]);
    expect((nextRoot as TileLeaf).activeTab).toBe(id2);
  });

  it("splits a tile when moving a panel to an edge", () => {
    const id1 = useAppStore.getState().addScatter("x", "y");
    const id2 = useAppStore.getState().addScatter("a", "b");
    const root = useAppStore.getState().plots.root;
    const target = collectLeaves(root).find((leaf) => leaf.tabs.includes(id1))!;

    useAppStore.getState().movePanelToTile(id2, target.id, "left");

    const nextRoot = useAppStore.getState().plots.root;
    expect(nextRoot?.type).toBe("split");
    expect(collectLeaves(nextRoot).map((leaf) => leaf.tabs)).toEqual([[id2], [id1]]);
  });

  it("addScatter3D appends a scatter3d panel with default depthCue=alpha", () => {
    const id = useAppStore.getState().addScatter3D("x", "y", "z");
    const panel = useAppStore.getState().plots.panels[0];
    expect(panel).toEqual({ id, kind: "scatter3d", x: "x", y: "y", z: "z", depthCue: "alpha", camera: undefined });
  });

  it("setScatter3DCamera updates camera and null clears it", () => {
    const id = useAppStore.getState().addScatter3D("x", "y", "z");
    const cam = { theta: 1, phi: 0.5, distance: 4, centerX: 0, centerY: 0, centerZ: 0 };
    useAppStore.getState().setScatter3DCamera(id, cam);
    expect(useAppStore.getState().plots.panels[0]).toMatchObject({ camera: cam });
    useAppStore.getState().setScatter3DCamera(id, null);
    expect(useAppStore.getState().plots.panels[0]).toMatchObject({ camera: null });
  });

  it("setScatter3DDepthCue updates depth cue mode", () => {
    const id = useAppStore.getState().addScatter3D("x", "y", "z");
    useAppStore.getState().setScatter3DDepthCue(id, "size");
    expect(useAppStore.getState().plots.panels[0]).toMatchObject({ depthCue: "size" });
    useAppStore.getState().setScatter3DDepthCue(id, "none");
    expect(useAppStore.getState().plots.panels[0]).toMatchObject({ depthCue: "none" });
  });
});

function collectLeaves(root: TileNode | null): TileLeaf[] {
  if (!root) return [];
  if (root.type === "leaf") return [root];
  return [...collectLeaves(root.first), ...collectLeaves(root.second)];
}
