import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeNumericColumn } from "@/lib/data/columns";

beforeEach(() => {
  useAppStore.getState().clear();
});

describe("EdgesSlice", () => {
  it("connects rows in order", () => {
    const df = new ArrayDataFrame([makeNumericColumn("x", new Float64Array([1, 2, 3, 4]))]);
    useAppStore.getState().setData(df);
    useAppStore.getState().connectRowsInOrder();

    const edges = useAppStore.getState().edges;
    expect(edges.mode).toBe("sequential");
    expect(edges.visible).toBe(true);
    expect(Array.from(edges.layer?.source ?? [])).toEqual([0, 1, 2]);
    expect(Array.from(edges.layer?.target ?? [])).toEqual([1, 2, 3]);
  });

  it("clamps edge alpha and clears edge layer", () => {
    const df = new ArrayDataFrame([makeNumericColumn("x", new Float64Array([1, 2, 3]))]);
    useAppStore.getState().setData(df);
    useAppStore.getState().connectRowsInOrder();
    useAppStore.getState().setEdgeAlpha(2);
    expect(useAppStore.getState().edges.alpha).toBe(1);

    useAppStore.getState().setEdgeAlpha(0);
    expect(useAppStore.getState().edges.alpha).toBe(0.02);

    useAppStore.getState().clearEdges();
    expect(useAppStore.getState().edges.layer).toBeNull();
    expect(useAppStore.getState().edges.visible).toBe(false);
    expect(useAppStore.getState().edges.mode).toBe("none");
  });

  it("setData clears an existing edge layer", () => {
    const df = new ArrayDataFrame([makeNumericColumn("x", new Float64Array([1, 2, 3]))]);
    useAppStore.getState().setData(df);
    useAppStore.getState().connectRowsInOrder();
    expect(useAppStore.getState().edges.layer).not.toBeNull();

    useAppStore.getState().setData(df);
    expect(useAppStore.getState().edges.layer).toBeNull();
  });

  it("setEdgeColorMode changes color mode and resets on layer change", () => {
    const df = new ArrayDataFrame([makeNumericColumn("x", new Float64Array([1, 2, 3]))]);
    useAppStore.getState().setData(df);
    useAppStore.getState().connectRowsInOrder();
    expect(useAppStore.getState().edges.colorMode).toBe("fixed");

    useAppStore.getState().setEdgeColorMode("endpoint");
    expect(useAppStore.getState().edges.colorMode).toBe("endpoint");

    useAppStore.getState().setEdgeColorMode("attribute");
    useAppStore.getState().setEdgeColorAttr("weight");
    expect(useAppStore.getState().edges.colorAttr).toBe("weight");

    useAppStore.getState().connectRowsInOrder();
    expect(useAppStore.getState().edges.colorMode).toBe("fixed");
    expect(useAppStore.getState().edges.colorAttr).toBeNull();
  });

  it("updates node-edge linking options", () => {
    expect(useAppStore.getState().edges.linkNodesToEdges).toBe(true);
    expect(useAppStore.getState().edges.linkEdgesToNodes).toBe(true);
    useAppStore.getState().setLinkNodesToEdges(false);
    useAppStore.getState().setLinkEdgesToNodes(false);
    expect(useAppStore.getState().edges.linkNodesToEdges).toBe(false);
    expect(useAppStore.getState().edges.linkEdgesToNodes).toBe(false);
  });

  it("adds and deletes custom edges", () => {
    const df = new ArrayDataFrame([makeNumericColumn("x", new Float64Array([1, 2, 3]))]);
    useAppStore.getState().setData(df);
    useAppStore.getState().addEdge(0, 2);
    expect(useAppStore.getState().edges.mode).toBe("custom");
    expect(useAppStore.getState().edges.visible).toBe(true);
    expect(Array.from(useAppStore.getState().edges.layer?.source ?? [])).toEqual([0]);
    expect(Array.from(useAppStore.getState().edges.layer?.target ?? [])).toEqual([2]);

    useAppStore.getState().addEdge(2, 0);
    expect(useAppStore.getState().edges.layer?.source.length).toBe(1);

    useAppStore.getState().deleteEdge(0);
    expect(useAppStore.getState().edges.layer).toBeNull();
    expect(useAppStore.getState().edges.visible).toBe(false);
  });

  it("updates edge edit mode", () => {
    expect(useAppStore.getState().edges.editMode).toBe("none");
    useAppStore.getState().setEdgeEditMode("add");
    expect(useAppStore.getState().edges.editMode).toBe("add");
    useAppStore.getState().setEdgeEditMode("delete");
    expect(useAppStore.getState().edges.editMode).toBe("delete");
  });
});
