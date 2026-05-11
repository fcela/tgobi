import type { StateCreator } from "zustand";
import type { AppStore, SelectionSlice } from "@/store/types";

export const createSelectionSlice: StateCreator<AppStore, [], [], SelectionSlice> = (set) => ({
  selection: {
    mask: new Uint8Array(0),
    paint: new Uint8Array(0),
    shape: new Uint8Array(0),
    shadow: new Uint8Array(0),
  },
  setSelectionMask: (mask) => set((s) => ({ selection: { ...s.selection, mask } })),
  setSelectionPaint: (paint) => set((s) => ({ selection: { ...s.selection, paint } })),
  setSelectionShape: (shape) => set((s) => ({ selection: { ...s.selection, shape } })),
  setSelectionShadow: (shadow) => set((s) => ({ selection: { ...s.selection, shadow } })),
  resetSelectionFor: (nrow) =>
    set({
      selection: {
        mask: new Uint8Array(Math.ceil(nrow / 8)),
        paint: new Uint8Array(nrow),
        shape: new Uint8Array(nrow),
        shadow: new Uint8Array(Math.ceil(nrow / 8)),
      },
    }),
});
