import type { StateCreator } from "zustand";
import type { AppStore, HullsSlice } from "@/store/types";

export const createHullsSlice: StateCreator<AppStore, [], [], HullsSlice> = (set) => ({
  hulls: {
    colorGroups: false,
    paintGroups: false,
    alpha: 0.72,
  },
  setColorHullsVisible: (visible) => set((s) => ({ hulls: { ...s.hulls, colorGroups: visible } })),
  setPaintHullsVisible: (visible) => set((s) => ({ hulls: { ...s.hulls, paintGroups: visible } })),
  setHullAlpha: (alpha) =>
    set((s) => ({ hulls: { ...s.hulls, alpha: Math.max(0.05, Math.min(1, alpha)) } })),
});
