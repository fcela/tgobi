import type { StateCreator } from "zustand";
import type {
  AppStore,
  PlotsSlice,
  PlotViewport,
  Scatter3DPanel,
  TileDropPosition,
  TileId,
  TileLeaf,
  TileNode,
} from "@/store/types";
import type { Camera3D } from "@/plots/scatter3d/types";

let tileCounter = 0;
function nextTileId(): TileId {
  return `t${++tileCounter}`;
}

function findTile(root: TileNode | null, tileId: TileId): TileNode | null {
  if (!root) return null;
  if (root.id === tileId) return root;
  if (root.type === "split") {
    return findTile(root.first, tileId) ?? findTile(root.second, tileId);
  }
  return null;
}

function findLeafContainingPanel(root: TileNode | null, panelId: number): TileLeaf | null {
  if (!root) return null;
  if (root.type === "leaf") return root.tabs.includes(panelId) ? root : null;
  return findLeafContainingPanel(root.first, panelId) ?? findLeafContainingPanel(root.second, panelId);
}

function replaceTile(root: TileNode, tileId: TileId, replacement: TileNode): TileNode {
  if (root.id === tileId) return replacement;
  if (root.type === "split") {
    return {
      ...root,
      first: replaceTile(root.first, tileId, replacement),
      second: replaceTile(root.second, tileId, replacement),
    };
  }
  return root;
}

function removeTileFromTree(root: TileNode, tileId: TileId): TileNode | null {
  if (root.id === tileId) return null;
  if (root.type === "split") {
    const first = removeTileFromTree(root.first, tileId);
    const second = removeTileFromTree(root.second, tileId);
    if (!first && !second) return null;
    if (!first) return second;
    if (!second) return first;
    return { ...root, first, second };
  }
  return root;
}

function collectPanelIds(node: TileNode): number[] {
  if (node.type === "leaf") return [...node.tabs];
  return [...collectPanelIds(node.first), ...collectPanelIds(node.second)];
}

function removeFromTree(root: TileNode, panelId: number): TileNode | null {
  if (root.type === "leaf") {
    const tabs = root.tabs.filter((id) => id !== panelId);
    if (tabs.length === 0) return null;
    const activeTab = root.activeTab === panelId ? tabs[0] ?? null : root.activeTab;
    return { ...root, tabs, activeTab };
  }
  const first = removeFromTree(root.first, panelId);
  const second = removeFromTree(root.second, panelId);
  if (!first && !second) return null;
  if (!first) return second;
  if (!second) return first;
  return { ...root, first, second };
}

function dropDirection(position: TileDropPosition): "horizontal" | "vertical" {
  return position === "left" || position === "right" ? "horizontal" : "vertical";
}

function dropSide(position: TileDropPosition): "first" | "second" {
  return position === "left" || position === "top" ? "first" : "second";
}

function normalizeViewport(viewport: PlotViewport): PlotViewport {
  const xMin = Math.min(viewport.xMin, viewport.xMax);
  const xMax = Math.max(viewport.xMin, viewport.xMax);
  const yMin = Math.min(viewport.yMin, viewport.yMax);
  const yMax = Math.max(viewport.yMin, viewport.yMax);
  return {
    xMin,
    xMax: xMax === xMin ? xMin + 1 : xMax,
    yMin,
    yMax: yMax === yMin ? yMin + 1 : yMax,
  };
}

function insertPanelIntoTile(
  root: TileNode,
  tileId: TileId,
  panelId: number,
  position: TileDropPosition,
): TileNode {
  const tile = findTile(root, tileId);
  if (!tile || tile.type !== "leaf") return root;

  if (position === "center") {
    const tabs = tile.tabs.includes(panelId)
      ? tile.tabs
      : [...tile.tabs, panelId];
    return replaceTile(root, tileId, { ...tile, tabs, activeTab: panelId });
  }

  const newLeaf: TileLeaf = {
    type: "leaf",
    id: nextTileId(),
    tabs: [panelId],
    activeTab: panelId,
  };
  const side = dropSide(position);
  const split: TileNode = {
    type: "split",
    id: nextTileId(),
    direction: dropDirection(position),
    ratio: 0.5,
    first: side === "first" ? newLeaf : tile,
    second: side === "second" ? newLeaf : tile,
  };
  return replaceTile(root, tileId, split);
}

export const createPlotsSlice: StateCreator<AppStore, [], [], PlotsSlice> = (set, get) => ({
  plots: { panels: [], nextId: 1, root: null, nextTileId: 1 },
  addScatter: (x, y) => {
    const id = get().plots.nextId;
    const panel = { id, kind: "scatter" as const, x, y };
    set((s) => {
      let root = s.plots.root;
      if (!root) {
        const leaf: TileLeaf = { type: "leaf", id: nextTileId(), tabs: [id], activeTab: id };
        root = leaf;
      } else {
        const existingRoot = root;
        const leaf: TileLeaf = { type: "leaf", id: nextTileId(), tabs: [id], activeTab: id };
        root = {
          type: "split",
          id: nextTileId(),
          direction: "horizontal",
          ratio: 0.5,
          first: existingRoot,
          second: leaf,
        };
      }
      return {
        plots: {
          ...s.plots,
          panels: [...s.plots.panels, panel],
          nextId: id + 1,
          root,
        },
      };
    });
    return id;
  },
  setScatterViewport: (id, viewport) =>
    set((s) => ({
      plots: {
        ...s.plots,
        panels: s.plots.panels.map((panel) =>
          panel.id === id && panel.kind === "scatter"
            ? { ...panel, viewport: viewport ? normalizeViewport(viewport) : null }
            : panel,
        ),
      },
    })),
  addBarchart: (variable, bins = 10) => {
    const id = get().plots.nextId;
    const panel = { id, kind: "barchart" as const, variable, bins };
    set((s) => {
      let root = s.plots.root;
      if (!root) {
        const leaf: TileLeaf = { type: "leaf", id: nextTileId(), tabs: [id], activeTab: id };
        root = leaf;
      } else {
        const existingRoot = root;
        const leaf: TileLeaf = { type: "leaf", id: nextTileId(), tabs: [id], activeTab: id };
        root = {
          type: "split",
          id: nextTileId(),
          direction: "horizontal",
          ratio: 0.5,
          first: existingRoot,
          second: leaf,
        };
      }
      return {
        plots: {
          ...s.plots,
          panels: [...s.plots.panels, panel],
          nextId: id + 1,
          root,
        },
      };
    });
    return id;
  },
  setBarchartBins: (id, bins) =>
    set((s) => ({
      plots: {
        ...s.plots,
        panels: s.plots.panels.map((panel) =>
          panel.id === id && panel.kind === "barchart"
            ? { ...panel, bins: Math.max(1, Math.min(40, Math.floor(bins))) }
            : panel,
        ),
      },
    })),
  addBoxplot: (variable, groupVar = null) => {
    const id = get().plots.nextId;
    const panel = { id, kind: "boxplot" as const, variable, groupVar };
    set((s) => {
      let root = s.plots.root;
      if (!root) {
        const leaf: TileLeaf = { type: "leaf", id: nextTileId(), tabs: [id], activeTab: id };
        root = leaf;
      } else {
        const existingRoot = root;
        const leaf: TileLeaf = { type: "leaf", id: nextTileId(), tabs: [id], activeTab: id };
        root = {
          type: "split",
          id: nextTileId(),
          direction: "horizontal",
          ratio: 0.5,
          first: existingRoot,
          second: leaf,
        };
      }
      return {
        plots: {
          ...s.plots,
          panels: [...s.plots.panels, panel],
          nextId: id + 1,
          root,
        },
      };
    });
    return id;
  },
  setBoxplotGroupVar: (id, groupVar) =>
  set((s) => ({
    plots: {
      ...s.plots,
      panels: s.plots.panels.map((panel) =>
        panel.id === id && panel.kind === "boxplot"
          ? { ...panel, groupVar }
          : panel,
      ),
    },
  })),
  addAndrews: (variables, resolution = 200) => {
    if (variables.length < 2) throw new Error("addAndrews: need at least 2 variables");
    const id = get().plots.nextId;
    const panel = { id, kind: "andrews" as const, variables, resolution };
    set((s) => {
      let root = s.plots.root;
      if (!root) {
        const leaf: TileLeaf = { type: "leaf", id: nextTileId(), tabs: [id], activeTab: id };
        root = leaf;
      } else {
        const existingRoot = root;
        const leaf: TileLeaf = { type: "leaf", id: nextTileId(), tabs: [id], activeTab: id };
        root = {
          type: "split",
          id: nextTileId(),
          direction: "horizontal",
          ratio: 0.5,
          first: existingRoot,
          second: leaf,
        };
      }
      return {
        plots: {
          ...s.plots,
          panels: [...s.plots.panels, panel],
          nextId: id + 1,
          root,
        },
}; 
});
return id;
},
addConcentric: (variables) => {
if (variables.length < 2) throw new Error("addConcentric: need at least 2 variables");
const id = get().plots.nextId;
const panel = { id, kind: "concentric" as const, variables };
set((s) => {
let root = s.plots.root;
if (!root) {
const leaf: TileLeaf = { type: "leaf", id: nextTileId(), tabs: [id], activeTab: id };
root = leaf;
} else {
const existingRoot = root;
const leaf: TileLeaf = { type: "leaf", id: nextTileId(), tabs: [id], activeTab: id };
root = {
type: "split",
id: nextTileId(),
direction: "horizontal",
ratio: 0.5,
first: existingRoot,
second: leaf,
};
}
return {
plots: {
...s.plots,
panels: [...s.plots.panels, panel],
nextId: id + 1,
root,
},
};
});
return id;
},
addDotplot: (variable, bins = 20) => {
const id = get().plots.nextId;
const panel = { id, kind: "dotplot" as const, variable, bins };
set((s) => {
      let root = s.plots.root;
      if (!root) {
        const leaf: TileLeaf = { type: "leaf", id: nextTileId(), tabs: [id], activeTab: id };
        root = leaf;
      } else {
        const existingRoot = root;
        const leaf: TileLeaf = { type: "leaf", id: nextTileId(), tabs: [id], activeTab: id };
        root = {
          type: "split",
          id: nextTileId(),
          direction: "horizontal",
          ratio: 0.5,
          first: existingRoot,
          second: leaf,
        };
      }
      return {
        plots: {
          ...s.plots,
          panels: [...s.plots.panels, panel],
          nextId: id + 1,
          root,
        },
      };
    });
    return id;
  },
  addScatmat: (variables) => {
    if (variables.length < 2) throw new Error("addScatmat: need at least 2 variables");
    const id = get().plots.nextId;
    const panel = { id, kind: "scatmat" as const, variables };
    set((s) => {
      let root = s.plots.root;
      if (!root) {
        const leaf: TileLeaf = { type: "leaf", id: nextTileId(), tabs: [id], activeTab: id };
        root = leaf;
      } else {
        const existingRoot = root;
        const leaf: TileLeaf = { type: "leaf", id: nextTileId(), tabs: [id], activeTab: id };
        root = {
          type: "split",
          id: nextTileId(),
          direction: "horizontal",
          ratio: 0.5,
          first: existingRoot,
          second: leaf,
        };
      }
      return {
        plots: {
          ...s.plots,
          panels: [...s.plots.panels, panel],
          nextId: id + 1,
          root,
        },
      };
    });
    return id;
  },
  addParcoords: (variables) => {
    if (variables.length < 2) throw new Error("addParcoords: need at least 2 variables");
    const id = get().plots.nextId;
    const panel = { id, kind: "parcoords" as const, variables, condVar: null as string | null };
    set((s) => {
      let root = s.plots.root;
      if (!root) {
        const leaf: TileLeaf = { type: "leaf", id: nextTileId(), tabs: [id], activeTab: id };
        root = leaf;
      } else {
        const existingRoot = root;
        const leaf: TileLeaf = { type: "leaf", id: nextTileId(), tabs: [id], activeTab: id };
        root = {
          type: "split",
          id: nextTileId(),
          direction: "horizontal",
          ratio: 0.5,
          first: existingRoot,
          second: leaf,
        };
      }
      return {
        plots: {
          ...s.plots,
          panels: [...s.plots.panels, panel],
          nextId: id + 1,
          root,
        },
      };
    });
    return id;
  },
  setParcoordsCondVar: (id, condVar) =>
    set((s) => ({
      plots: {
        ...s.plots,
        panels: s.plots.panels.map((p) =>
          p.id === id && p.kind === "parcoords" ? { ...p, condVar } : p,
        ),
      },
    })),
  addMissingPattern: () => {
    const id = get().plots.nextId;
    const panel = { id, kind: "missingPattern" as const };
    set((s) => {
      let root = s.plots.root;
      if (!root) {
        const leaf: TileLeaf = { type: "leaf", id: nextTileId(), tabs: [id], activeTab: id };
        root = leaf;
      } else {
        const existingRoot = root;
        const leaf: TileLeaf = { type: "leaf", id: nextTileId(), tabs: [id], activeTab: id };
        root = {
          type: "split",
          id: nextTileId(),
          direction: "horizontal",
          ratio: 0.5,
          first: existingRoot,
          second: leaf,
        };
      }
      return {
        plots: {
          ...s.plots,
          panels: [...s.plots.panels, panel],
          nextId: id + 1,
          root,
        },
      };
    });
    return id;
  },
  addTimeseries: (x, y, groupVar = null, display = "points+lines") => {
    if (y.length === 0) throw new Error("addTimeseries: need at least 1 y variable");
    const id = get().plots.nextId;
    const panel = { id, kind: "timeseries" as const, x, y, groupVar, display };
    set((s) => {
      let root = s.plots.root;
      if (!root) {
        const leaf: TileLeaf = { type: "leaf", id: nextTileId(), tabs: [id], activeTab: id };
        root = leaf;
      } else {
        const existingRoot = root;
        const leaf: TileLeaf = { type: "leaf", id: nextTileId(), tabs: [id], activeTab: id };
        root = {
          type: "split",
          id: nextTileId(),
          direction: "horizontal",
          ratio: 0.5,
          first: existingRoot,
          second: leaf,
        };
      }
      return {
        plots: {
          ...s.plots,
          panels: [...s.plots.panels, panel],
          nextId: id + 1,
          root,
        },
      };
    });
    return id;
  },
  setTimeseriesViewport: (id, viewport) =>
    set((s) => ({
      plots: {
        ...s.plots,
        panels: s.plots.panels.map((panel) =>
          panel.id === id && panel.kind === "timeseries"
            ? { ...panel, viewport: viewport ? normalizeViewport(viewport) : null }
            : panel,
        ),
      },
    })),
  setTimeseriesDisplay: (id, display) =>
    set((s) => ({
      plots: {
        ...s.plots,
        panels: s.plots.panels.map((panel) =>
          panel.id === id && panel.kind === "timeseries"
            ? { ...panel, display }
            : panel,
        ),
      },
    })),
  addScatter3D: (x, y, z) => {
    const id = get().plots.nextId;
    const panel: Scatter3DPanel = { id, kind: "scatter3d", x, y, z, depthCue: "alpha" };
    set((s) => {
      let root = s.plots.root;
      if (!root) {
        const leaf: TileLeaf = { type: "leaf", id: nextTileId(), tabs: [id], activeTab: id };
        root = leaf;
      } else {
        const existingRoot = root;
        const leaf: TileLeaf = { type: "leaf", id: nextTileId(), tabs: [id], activeTab: id };
        root = {
          type: "split",
          id: nextTileId(),
          direction: "horizontal",
          ratio: 0.5,
          first: existingRoot,
          second: leaf,
        };
      }
      return {
        plots: {
          ...s.plots,
          panels: [...s.plots.panels, panel],
          nextId: id + 1,
          root,
        },
      };
    });
    return id;
  },
  setScatter3DCamera: (id, camera) =>
    set((s) => ({
      plots: {
        ...s.plots,
        panels: s.plots.panels.map((panel) =>
          panel.id === id && panel.kind === "scatter3d"
            ? { ...panel, camera: camera ? { ...camera } : null }
            : panel,
        ),
      },
    })),
  setScatter3DDepthCue: (id, depthCue) =>
    set((s) => ({
      plots: {
        ...s.plots,
        panels: s.plots.panels.map((panel) =>
          panel.id === id && panel.kind === "scatter3d"
            ? { ...panel, depthCue }
            : panel,
        ),
      },
    })),
  addMapper: () => {
    const id = get().plots.nextId;
    const panel = { id, kind: "mapper" as const };
    set((s) => {
      let root = s.plots.root;
      if (!root) {
        const leaf: TileLeaf = { type: "leaf", id: nextTileId(), tabs: [id], activeTab: id };
        root = leaf;
      } else {
        const existingRoot = root;
        const leaf: TileLeaf = { type: "leaf", id: nextTileId(), tabs: [id], activeTab: id };
        root = {
          type: "split",
          id: nextTileId(),
          direction: "horizontal",
          ratio: 0.5,
          first: existingRoot,
          second: leaf,
        };
      }
      return {
        plots: {
          ...s.plots,
          panels: [...s.plots.panels, panel],
          nextId: id + 1,
          root,
        },
      };
    });
    return id;
  },
  removePanel: (id) =>
    set((s) => {
      const root = s.plots.root ? removeFromTree(s.plots.root, id) : null;
      return {
        plots: {
          ...s.plots,
          panels: s.plots.panels.filter((p) => p.id !== id),
          root,
        },
      };
    }),
  clearPanels: () =>
    set((s) => ({
      plots: { ...s.plots, panels: [], root: null },
    })),
  splitTile: (tileId, direction, panelId, side) =>
    set((s) => {
      if (!s.plots.root) return s;
      const tile = findTile(s.plots.root, tileId);
      if (!tile || tile.type !== "leaf") return s;
      const newLeaf: TileLeaf = { type: "leaf", id: nextTileId(), tabs: [panelId], activeTab: panelId };
      const split: TileNode = {
        type: "split",
        id: nextTileId(),
        direction,
        ratio: 0.5,
        first: side === "first" ? newLeaf : tile,
        second: side === "second" ? newLeaf : tile,
      };
      const root = replaceTile(s.plots.root, tileId, split);
      const panels = s.plots.panels.find((p) => p.id === panelId)
        ? s.plots.panels
        : s.plots.panels;
      return { plots: { ...s.plots, root, panels } };
    }),
  closeTab: (tileId, panelId) =>
    set((s) => {
      if (!s.plots.root) return s;
      const tile = findTile(s.plots.root, tileId);
      if (!tile || tile.type !== "leaf") return s;
      const tabs = tile.tabs.filter((id) => id !== panelId);
      if (tabs.length === 0) {
        const root = removeTileFromTree(s.plots.root, tileId);
        return { plots: { ...s.plots, root, panels: s.plots.panels.filter((p) => p.id !== panelId) } };
      }
      const activeTab = tile.activeTab === panelId ? (tabs[0] ?? null) : tile.activeTab;
      const updated: TileLeaf = { ...tile, tabs, activeTab };
      const root = replaceTile(s.plots.root, tileId, updated);
      return { plots: { ...s.plots, root, panels: s.plots.panels.filter((p) => p.id !== panelId) } };
    }),
  setActiveTab: (tileId, panelId) =>
    set((s) => {
      if (!s.plots.root) return s;
      const tile = findTile(s.plots.root, tileId);
      if (!tile || tile.type !== "leaf") return s;
      if (!tile.tabs.includes(panelId)) return s;
      const updated: TileLeaf = { ...tile, activeTab: panelId };
      const root = replaceTile(s.plots.root, tileId, updated);
      return { plots: { ...s.plots, root } };
    }),
  movePanelToTile: (panelId, tileId, position) =>
    set((s) => {
      const root = s.plots.root;
      if (!root) return s;
      if (!s.plots.panels.some((p) => p.id === panelId)) return s;
      const source = findLeafContainingPanel(root, panelId);
      const target = findTile(root, tileId);
      if (!source || !target || target.type !== "leaf") return s;

      if (source.id === tileId && position === "center") {
        const updated: TileLeaf = { ...source, activeTab: panelId };
        return { plots: { ...s.plots, root: replaceTile(root, tileId, updated) } };
      }

      const withoutPanel = removeFromTree(root, panelId);
      if (!withoutPanel) return s;
      if (!findTile(withoutPanel, tileId)) return s;
      const nextRoot = insertPanelIntoTile(withoutPanel, tileId, panelId, position);
      return { plots: { ...s.plots, root: nextRoot } };
    }),
  resizeSplit: (tileId, ratio) =>
    set((s) => {
      if (!s.plots.root) return s;
      const tile = findTile(s.plots.root, tileId);
      if (!tile || tile.type !== "split") return s;
      const clamped = Math.max(0.1, Math.min(0.9, ratio));
      const updated: TileNode = { ...tile, ratio: clamped };
      const root = replaceTile(s.plots.root, tileId, updated);
      return { plots: { ...s.plots, root } };
    }),
});
