import type { StateCreator } from "zustand";
import type { AppStore, TourSlice, SavedView, TourShape } from "@/store/types";

const DEFAULT_SPEED = 1200;

export const createTourSlice: StateCreator<AppStore, [], [], TourSlice> = (set, get) => ({
  tour: {
    activePanelId: null,
    shape: "2d",
    mode: "grand",
    ppIndex: "holes",
    ppValue: null,
    isPlaying: false,
    speed: DEFAULT_SPEED,
    activeVars: [],
    frozenVars: [],
    manualVar: null,
    manualValue: 0,
    basis: null,
    proj: null,
    t: 0,
    savedViews: [],
    nextViewId: 1,
  },

  startTour: (panelId, shape, vars) =>
    set((s) => ({
      tour: { ...s.tour, activePanelId: panelId, shape, activeVars: vars,
        frozenVars: [], manualVar: null, manualValue: 0, isPlaying: true, basis: null, proj: null, ppValue: null, t: 0 },
    })),

  pauseTour: () => set((s) => ({ tour: { ...s.tour, isPlaying: false } })),
  resumeTour: () => set((s) => ({ tour: { ...s.tour, isPlaying: true } })),

stopTour: () =>
  set((s) => ({
    tour: { ...s.tour, activePanelId: null, isPlaying: false,
      frozenVars: [], manualVar: null, manualValue: 0, basis: null, proj: null, ppValue: null, t: 0 },
  })),

  setTourSpeed: (speed) => set((s) => ({ tour: { ...s.tour, speed } })),
  setTourShape: (shape: TourShape) => set((s) => ({ tour: { ...s.tour, shape } })),
  setTourMode: (mode: "grand" | "pp" | "manual") => set((s) => ({ tour: { ...s.tour, mode, ppValue: null } })),
  setTourPpIndex: (ppIndex) => set((s) => ({ tour: { ...s.tour, ppIndex, ppValue: null } })),
  setTourActiveVars: (vars) => set((s) => {
    const manualVar = s.tour.manualVar && vars.includes(s.tour.manualVar) ? s.tour.manualVar : null;
    return {
      tour: {
        ...s.tour,
        activeVars: vars,
        frozenVars: s.tour.frozenVars.filter((name) => vars.includes(name)),
        manualVar,
      },
    };
  }),

  toggleTourVarFrozen: (name) => set((s) => {
    if (!s.tour.activeVars.includes(name)) return s;
    const frozen = s.tour.frozenVars.includes(name)
      ? s.tour.frozenVars.filter((v) => v !== name)
      : [...s.tour.frozenVars, name];
    return { tour: { ...s.tour, frozenVars: frozen } };
  }),

  setManualVarValue: (name, value) => set((s) => {
    if (!s.tour.activeVars.includes(name)) return s;
    const frozen = s.tour.frozenVars.includes(name)
      ? s.tour.frozenVars
      : [...s.tour.frozenVars, name];
    return { tour: { ...s.tour, frozenVars: frozen, manualVar: name, manualValue: value } };
  }),

  setTourFrame: (basis, proj, t, ppValue) =>
    set((s) => ({ tour: { ...s.tour, basis, proj, t, ppValue: ppValue === undefined ? s.tour.ppValue : ppValue } })),

  saveCurrentView: (name) => {
    const t = get().tour;
    if (t.activePanelId == null || !t.basis) {
      throw new Error("saveCurrentView: no active tour");
    }
    const id = t.nextViewId;
    const view: SavedView = {
      id,
      name,
      panelId: t.activePanelId,
      shape: t.shape,
      vars: [...t.activeVars],
      basis: new Float64Array(t.basis),
    };
    set((s) => ({
      tour: { ...s.tour, savedViews: [...s.tour.savedViews, view], nextViewId: id + 1 },
    }));
    return id;
  },

  restoreView: (id) => {
    const v = get().tour.savedViews.find((x) => x.id === id);
    if (!v) return;
    set((s) => ({
      tour: {
        ...s.tour,
        activePanelId: v.panelId,
        shape: v.shape,
        activeVars: [...v.vars],
        frozenVars: [],
        basis: new Float64Array(v.basis),
        proj: null,
        ppValue: null,
        t: 1,
        isPlaying: false,
      },
    }));
  },

  removeView: (id) =>
    set((s) => ({
      tour: { ...s.tour, savedViews: s.tour.savedViews.filter((v) => v.id !== id) },
    })),
});
