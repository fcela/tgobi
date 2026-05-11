import type { StateCreator } from "zustand";
import type { AppStore, ToolsSlice } from "@/store/types";
import { bitClear, bitGet, bitSet } from "@/lib/brush/hitTest";

export const createToolsSlice: StateCreator<AppStore, [], [], ToolsSlice> = (set) => ({
  tools: {
    active: "brush",
    hoverRow: null,
    pinnedRows: new Uint8Array(0),
    labelVar: null,
  },
  setActiveTool: (active) => set((s) => ({ tools: { ...s.tools, active } })),
  setIdentifyHover: (hoverRow) => set((s) => ({ tools: { ...s.tools, hoverRow } })),
  togglePinnedIdentify: (row) =>
    set((s) => {
      if (row < 0 || row >= s.tools.pinnedRows.length * 8) return s;
      const pinnedRows = new Uint8Array(s.tools.pinnedRows);
      if (bitGet(pinnedRows, row)) bitClear(pinnedRows, row);
      else bitSet(pinnedRows, row);
      return { tools: { ...s.tools, pinnedRows } };
    }),
  clearPinnedIdentify: () =>
    set((s) => ({ tools: { ...s.tools, pinnedRows: new Uint8Array(s.tools.pinnedRows.length) } })),
  setIdentifyLabelVar: (labelVar) => set((s) => ({ tools: { ...s.tools, labelVar } })),
  resetIdentifyFor: (nrow) =>
    set((s) => ({
      tools: {
        ...s.tools,
        hoverRow: null,
        pinnedRows: new Uint8Array(Math.ceil(nrow / 8)),
        labelVar: null,
      },
    })),
});
