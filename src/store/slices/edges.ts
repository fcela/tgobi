import type { StateCreator } from "zustand";
import { sequentialEdges } from "@/lib/edges/sequential";
import { bitGet, bitSet } from "@/lib/brush/hitTest";
import type { Edges } from "@/lib/edges/types";
import type { AppStore, EdgesSlice } from "@/store/types";

const DEFAULT_EDGE_ALPHA = 0.32;

function emptyEdgeSelection(n = 0): { mask: Uint8Array; paint: Uint8Array; shadow: Uint8Array } {
  return {
    mask: new Uint8Array(Math.ceil(n / 8)),
    paint: new Uint8Array(n),
    shadow: new Uint8Array(Math.ceil(n / 8)),
  };
}

export const createEdgesSlice: StateCreator<AppStore, [], [], EdgesSlice> = (set, get) => ({
  edges: {
    layer: null,
    mode: "none",
    visible: false,
    alpha: DEFAULT_EDGE_ALPHA,
    colorMode: "fixed",
    colorAttr: null,
    editMode: "none",
    linkNodesToEdges: true,
    linkEdgesToNodes: true,
    selection: emptyEdgeSelection(),
  },
  setEdgesLayer: (layer, mode = layer ? "custom" : "none") =>
    set((s) => ({
      edges: {
        ...s.edges,
        layer,
        mode,
        visible: layer ? true : false,
        colorMode: "fixed",
        colorAttr: null,
        editMode: layer ? s.edges.editMode : "none",
        selection: emptyEdgeSelection(layer ? layer.source.length : 0),
      },
    })),
  connectRowsInOrder: () =>
    set((s) => {
      const nrow = get().df?.nrow ?? 0;
      const layer = nrow > 1 ? sequentialEdges(nrow) : null;
      return {
        edges: {
          ...s.edges,
          layer,
          mode: layer ? "sequential" : "none",
          visible: layer ? true : false,
          colorMode: "fixed",
          colorAttr: null,
          editMode: s.edges.editMode,
          selection: emptyEdgeSelection(layer ? layer.source.length : 0),
        },
      };
    }),
  clearEdges: () =>
    set((s) => ({
      edges: {
        ...s.edges,
        layer: null,
        mode: "none",
        visible: false,
        colorMode: "fixed",
        colorAttr: null,
        editMode: "none",
        selection: emptyEdgeSelection(),
      },
    })),
  setEdgesVisible: (visible) => set((s) => ({ edges: { ...s.edges, visible } })),
  setEdgeAlpha: (alpha) =>
    set((s) => ({
      edges: {
        ...s.edges,
        alpha: Math.max(0.02, Math.min(1, alpha)),
      },
    })),
  setEdgeColorMode: (colorMode) =>
    set((s) => ({ edges: { ...s.edges, colorMode, colorAttr: colorMode === "attribute" ? s.edges.colorAttr : null } })),
  setEdgeColorAttr: (colorAttr) =>
    set((s) => ({ edges: { ...s.edges, colorAttr } })),
  setEdgeEditMode: (editMode) =>
    set((s) => ({ edges: { ...s.edges, editMode } })),
  addEdge: (source, target) =>
    set((s) => {
      const nrow = get().df?.nrow ?? 0;
      if (!Number.isInteger(source) || !Number.isInteger(target)) return { edges: s.edges };
      if (source < 0 || target < 0 || source >= nrow || target >= nrow || source === target) return { edges: s.edges };
      const layer = s.edges.layer;
      if (layer && edgeExists(layer, source, target)) return { edges: s.edges };
      const nextLayer = appendEdge(layer, source, target);
      return {
        edges: {
          ...s.edges,
          layer: nextLayer,
          mode: "custom",
          visible: true,
          colorMode: s.edges.colorMode === "attribute" ? "fixed" : s.edges.colorMode,
          colorAttr: null,
          selection: appendEdgeSelection(s.edges.selection),
        },
      };
    }),
  deleteEdge: (index) =>
    set((s) => {
      const layer = s.edges.layer;
      const n = layer?.source.length ?? 0;
      if (!layer || !Number.isInteger(index) || index < 0 || index >= n) return { edges: s.edges };
      if (n === 1) {
        return {
          edges: {
            ...s.edges,
            layer: null,
            mode: "none",
            visible: false,
            colorMode: "fixed",
            colorAttr: null,
            editMode: "none",
            selection: emptyEdgeSelection(),
          },
        };
      }
      return {
        edges: {
          ...s.edges,
          layer: deleteEdgeAt(layer, index),
          mode: "custom",
          colorMode: s.edges.colorMode === "attribute" ? "fixed" : s.edges.colorMode,
          colorAttr: null,
          selection: deleteEdgeSelectionAt(s.edges.selection, index, n),
        },
      };
    }),
  setLinkNodesToEdges: (enabled) =>
    set((s) => ({ edges: { ...s.edges, linkNodesToEdges: enabled } })),
  setLinkEdgesToNodes: (enabled) =>
    set((s) => ({ edges: { ...s.edges, linkEdgesToNodes: enabled } })),
  setEdgeSelectionMask: (mask) =>
    set((s) => ({ edges: { ...s.edges, selection: { ...s.edges.selection, mask } } })),
  setEdgeSelectionPaint: (paint) =>
    set((s) => ({ edges: { ...s.edges, selection: { ...s.edges.selection, paint } } })),
  setEdgeSelectionShadow: (shadow) =>
    set((s) => ({ edges: { ...s.edges, selection: { ...s.edges.selection, shadow } } })),
});

function edgeExists(layer: Edges, source: number, target: number): boolean {
  for (let e = 0; e < layer.source.length; e++) {
    const a = layer.source[e]!;
    const b = layer.target[e]!;
    if (a === source && b === target) return true;
    if (!layer.directed && a === target && b === source) return true;
  }
  return false;
}

function appendEdge(layer: Edges | null, source: number, target: number): Edges {
  const oldSource = layer?.source ?? new Int32Array(0);
  const oldTarget = layer?.target ?? new Int32Array(0);
  const nextSource = new Int32Array(oldSource.length + 1);
  const nextTarget = new Int32Array(oldTarget.length + 1);
  nextSource.set(oldSource);
  nextTarget.set(oldTarget);
  nextSource[oldSource.length] = source;
  nextTarget[oldTarget.length] = target;
  return { source: nextSource, target: nextTarget, directed: layer?.directed ?? false };
}

function deleteEdgeAt(layer: Edges, index: number): Edges {
  const nextSource = new Int32Array(layer.source.length - 1);
  const nextTarget = new Int32Array(layer.target.length - 1);
  for (let i = 0, j = 0; i < layer.source.length; i++) {
    if (i === index) continue;
    nextSource[j] = layer.source[i]!;
    nextTarget[j] = layer.target[i]!;
    j++;
  }
  return { source: nextSource, target: nextTarget, directed: layer.directed };
}

function appendEdgeSelection(selection: { mask: Uint8Array; paint: Uint8Array; shadow: Uint8Array }) {
  const next = emptyEdgeSelection(selection.paint.length + 1);
  next.mask.set(selection.mask.subarray(0, next.mask.length));
  next.paint.set(selection.paint);
  next.shadow.set(selection.shadow.subarray(0, next.shadow.length));
  return next;
}

function deleteEdgeSelectionAt(
  selection: { mask: Uint8Array; paint: Uint8Array; shadow: Uint8Array },
  index: number,
  oldLength: number,
) {
  const next = emptyEdgeSelection(oldLength - 1);
  for (let i = 0, j = 0; i < oldLength; i++) {
    if (i === index) continue;
    if (bitGet(selection.mask, i)) bitSet(next.mask, j);
    if (bitGet(selection.shadow, i)) bitSet(next.shadow, j);
    next.paint[j] = selection.paint[i] ?? 0;
    j++;
  }
  return next;
}
