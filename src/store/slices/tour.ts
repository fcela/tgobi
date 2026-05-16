import type { StateCreator } from "zustand";
import type { AppStore, TourSlice, SavedView, TourShape, TourMode, TourKeyframe } from "@/store/types";

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
    keyframes: [],
    nextKeyframeId: 1,
    scrubberT: 0,
    scrubbing: false,
    langevinStep: 0.05,
    langevinDiffusion: 1.0,
    ppScoreTrace: [],
    ppClassSource: "paint",
  },

  startTour: (panelId, shape, vars) =>
    set((s) => ({
      tour: { ...s.tour, activePanelId: panelId, shape, activeVars: vars,
        frozenVars: [], manualVar: null, manualValue: 0, isPlaying: true, basis: null, proj: null, ppValue: null, t: 0,
        keyframes: [], scrubberT: 0, scrubbing: false, ppScoreTrace: [] },
    })),

  pauseTour: () => set((s) => ({ tour: { ...s.tour, isPlaying: false } })),
  resumeTour: () => set((s) => ({ tour: { ...s.tour, isPlaying: true } })),

  stopTour: () =>
    set((s) => ({
      tour: { ...s.tour, activePanelId: null, isPlaying: false,
        frozenVars: [], manualVar: null, manualValue: 0, basis: null, proj: null, ppValue: null, t: 0,
        keyframes: [], scrubberT: 0, scrubbing: false, ppScoreTrace: [] },
    })),

  setTourSpeed: (speed) => set((s) => ({ tour: { ...s.tour, speed } })),
  setTourShape: (shape: TourShape) => set((s) => {
    if (s.tour.activePanelId == null) return { tour: { ...s.tour, shape } };
    const want = shape === "2d" ? "scatter" : "dotplot";
    const compatible = s.plots.panels.find((p) => p.kind === want);
    if (!compatible) return { tour: { ...s.tour, shape } };
    return {
      tour: {
        ...s.tour,
        shape,
        activePanelId: compatible.id,
        basis: null,
        proj: null,
        ppValue: null,
        t: 0,
        ppScoreTrace: [],
      },
    };
  }),
  setTourMode: (mode: TourMode) => set((s) => {
    if (mode === "guided" || mode === "langevin") {
      return { tour: { ...s.tour, mode, ppValue: null, frozenVars: [], manualVar: null, manualValue: 0, ppScoreTrace: [] } };
    }
    if (mode !== "manual") {
      return { tour: { ...s.tour, mode, ppValue: null, frozenVars: [], manualVar: null, manualValue: 0, ppScoreTrace: [] } };
    }
    return { tour: { ...s.tour, mode, ppValue: null, ppScoreTrace: [] } };
  }),
  setTourPpIndex: (ppIndex) => set((s) => ({ tour: { ...s.tour, ppIndex, ppValue: null, ppScoreTrace: [] } })),
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
    set((s) => {
      const nextTrace = ppValue != null
        ? [...s.tour.ppScoreTrace, ppValue].slice(-100)
        : s.tour.ppScoreTrace;
      return { tour: { ...s.tour, basis, proj, t, ppValue: ppValue === undefined ? s.tour.ppValue : ppValue, ppScoreTrace: nextTrace } };
    }),

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

  addKeyframe: (basis, source, name) => {
    const t = get().tour;
    const id = t.nextKeyframeId;
    const kf: TourKeyframe = {
      id,
      basis: new Float64Array(basis),
      source,
      name: name ?? `KF ${id}`,
    };
    set((s) => ({
      tour: { ...s.tour, keyframes: [...s.tour.keyframes, kf], nextKeyframeId: id + 1 },
    }));
    return id;
  },

  removeKeyframe: (id) =>
  set((s) => ({
    tour: { ...s.tour, keyframes: s.tour.keyframes.filter((kf) => kf.id !== id) },
  })),

  clearKeyframes: () => set((s) => ({ tour: { ...s.tour, keyframes: [] } })),

  setScrubberT: (t) => set((s) => ({ tour: { ...s.tour, scrubberT: t } })),

  setScrubbing: (scrubbing) => set((s) => ({ tour: { ...s.tour, scrubbing } })),

  addSavedViewAsKeyframe: (viewId) => {
    const v = get().tour.savedViews.find((x) => x.id === viewId);
    if (!v) return;
    get().addKeyframe(v.basis, "saved", v.name);
  },

  setLangevinStep: (step) => set((s) => ({ tour: { ...s.tour, langevinStep: step } })),
  setLangevinDiffusion: (diffusion) => set((s) => ({ tour: { ...s.tour, langevinDiffusion: diffusion } })),
  setPpClassSource: (source) => set((s) => ({ tour: { ...s.tour, ppClassSource: source, ppScoreTrace: [] } })),
});
