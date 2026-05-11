import type { StateCreator } from "zustand";
import type { AppStore, BrushSlice, Rect } from "@/store/types";

export const createBrushSlice: StateCreator<AppStore, [], [], BrushSlice> = (set) => ({
  brush: {
    mode: "transient",
    tool: "rectangle",
    target: "nodes",
    paintColor: 6,
    paintShape: 1,
    activeRect: null,
    activePath: null,
    activePanelId: null,
  },
  setBrushMode: (mode) => set((s) => ({ brush: { ...s.brush, mode } })),
  setBrushTool: (tool) => set((s) => ({ brush: { ...s.brush, tool } })),
  setBrushTarget: (target) => set((s) => ({ brush: { ...s.brush, target } })),
  setPaintColor: (paintColor) => set((s) => ({ brush: { ...s.brush, paintColor } })),
  setPaintShape: (paintShape) => set((s) => ({ brush: { ...s.brush, paintShape } })),
  setActiveBrush: (
    activePanelId: number | null,
    activeRect: Rect | null,
    activePath = null,
  ) =>
    set((s) => ({ brush: { ...s.brush, activePanelId, activeRect, activePath } })),
});
