import type { StateCreator } from "zustand";
import type { AppStore, VariablesSlice } from "@/store/types";
import type { VarSpec, ScalingMode } from "@/types";

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
  setScaling: (name, scaling) =>
  set((s) => ({
    spec: s.spec.map((v) => {
      if (v.name !== name) return v;
      if (scaling === undefined) { const { scaling: _ignored, ...rest } = v; return rest; }
      return { ...v, scaling };
    }),
  })),
  setGroup: (name, group) =>
  set((s) => ({
    spec: s.spec.map((v) => {
      if (v.name !== name) return v;
      if (!group) { const { group: _ignored, ...rest } = v; return rest; }
      return { ...v, group };
    }),
  })),
  setGroupScaling: (group, scaling) =>
  set((s) => ({
    spec: s.spec.map((v) => {
      if (v.group !== group) return v;
      if (scaling === undefined) { const { scaling: _ignored, ...rest } = v; return rest; }
      return { ...v, scaling };
    }),
  })),
});
