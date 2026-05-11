import type { StateCreator } from "zustand";
import type { AppStore, VariablesSlice } from "@/store/types";
import type { VarSpec } from "@/types";

export const createVariablesSlice: StateCreator<AppStore, [], [], VariablesSlice> = (set) => ({
  spec: [],
  setSpec: (spec: VarSpec[]) => set({ spec }),
  setIncluded: (name, included) =>
    set((s) => ({
      spec: s.spec.map((v) => (v.name === name ? { ...v, included } : v)),
    })),
  setType: (name, type) =>
    set((s) => ({
      spec: s.spec.map((v) => (v.name === name ? { ...v, type } : v)),
    })),
});
