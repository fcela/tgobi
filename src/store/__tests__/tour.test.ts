import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";

beforeEach(() => {
  useAppStore.getState().clear();
  // Reset tour state by stopping and clearing saved views
  useAppStore.getState().stopTour();
  const s = useAppStore.getState();
  // Remove all saved views to ensure clean state
  for (const v of s.tour.savedViews) {
    s.removeView(v.id);
  }
});

describe("TourSlice", () => {
  it("defaults", () => {
    const t = useAppStore.getState().tour;
    expect(t.activePanelId).toBeNull();
    expect(t.shape).toBe("2d");
    expect(t.mode).toBe("grand");
    expect(t.ppIndex).toBe("holes");
    expect(t.ppValue).toBeNull();
    expect(t.isPlaying).toBe(false);
    expect(t.frozenVars).toEqual([]);
    expect(t.manualVar).toBeNull();
    expect(t.manualValue).toBe(0);
    expect(t.savedViews).toEqual([]);
    expect(t.keyframes).toEqual([]);
    expect(t.scrubberT).toBe(0);
    expect(t.scrubbing).toBe(false);
  });

  it("startTour activates and plays", () => {
    useAppStore.getState().startTour(7, "2d", ["a", "b", "c"]);
    const t = useAppStore.getState().tour;
    expect(t.activePanelId).toBe(7);
    expect(t.shape).toBe("2d");
    expect(t.activeVars).toEqual(["a", "b", "c"]);
    expect(t.isPlaying).toBe(true);
  });

  it("pause/resume toggles isPlaying", () => {
    useAppStore.getState().startTour(1, "1d", ["a"]);
    useAppStore.getState().pauseTour();
    expect(useAppStore.getState().tour.isPlaying).toBe(false);
    useAppStore.getState().resumeTour();
    expect(useAppStore.getState().tour.isPlaying).toBe(true);
  });

  it("stopTour clears active panel and basis", () => {
    useAppStore.getState().startTour(2, "2d", ["a", "b"]);
    useAppStore.getState().setTourFrame(
      new Float64Array([1, 0, 0, 1]),
      new Float64Array([0.1, 0.2]),
      0,
    );
    useAppStore.getState().stopTour();
    const t = useAppStore.getState().tour;
    expect(t.activePanelId).toBeNull();
    expect(t.isPlaying).toBe(false);
    expect(t.basis).toBeNull();
    expect(t.proj).toBeNull();
  });

  it("setTourFrame replaces typed arrays by reference", () => {
    useAppStore.getState().startTour(1, "2d", ["a", "b"]);
    const B = new Float64Array([1, 0, 0, 1]);
    const P = new Float64Array([0.1, 0.2, 0.3, 0.4]);
    useAppStore.getState().setTourFrame(B, P, 0.25);
    const t = useAppStore.getState().tour;
    expect(t.basis).toBe(B);
    expect(t.proj).toBe(P);
    expect(t.t).toBe(0.25);
  });

  it("sets projection pursuit mode, index, and score", () => {
    useAppStore.getState().setTourMode("pp");
    useAppStore.getState().setTourPpIndex("lda");
    useAppStore.getState().setTourFrame(
      new Float64Array([1, 0, 0, 1]),
      new Float64Array([0.1, 0.2, 0.3, 0.4]),
      0.5,
      1.25,
    );
    const t = useAppStore.getState().tour;
    expect(t.mode).toBe("pp");
    expect(t.ppIndex).toBe("lda");
    expect(t.ppValue).toBe(1.25);
  });

  it("toggles frozen tour variables and drops inactive ones", () => {
    useAppStore.getState().startTour(1, "2d", ["a", "b", "c"]);
    useAppStore.getState().toggleTourVarFrozen("b");
    expect(useAppStore.getState().tour.frozenVars).toEqual(["b"]);
    useAppStore.getState().toggleTourVarFrozen("b");
    expect(useAppStore.getState().tour.frozenVars).toEqual([]);
    useAppStore.getState().toggleTourVarFrozen("c");
    useAppStore.getState().setTourActiveVars(["a", "b"]);
    expect(useAppStore.getState().tour.frozenVars).toEqual([]);
  });

  it("setManualVarValue freezes and sets manual value", () => {
    useAppStore.getState().startTour(1, "2d", ["a", "b", "c"]);
    useAppStore.getState().setManualVarValue("b", 0.7);
    const t = useAppStore.getState().tour;
    expect(t.frozenVars).toContain("b");
    expect(t.manualVar).toBe("b");
    expect(t.manualValue).toBe(0.7);
  });

  it("setManualVarValue is a no-op for inactive variable", () => {
    useAppStore.getState().startTour(1, "2d", ["a", "b"]);
    useAppStore.getState().setManualVarValue("z", 0.5);
    const t = useAppStore.getState().tour;
    expect(t.frozenVars).toEqual([]);
    expect(t.manualVar).toBeNull();
  });

  it("setTourMode supports manual", () => {
    useAppStore.getState().setTourMode("manual");
    expect(useAppStore.getState().tour.mode).toBe("manual");
  });

  it("setTourMode supports guided", () => {
    useAppStore.getState().setTourMode("guided");
    expect(useAppStore.getState().tour.mode).toBe("guided");
  });

  it("setTourMode clears frozen and manual when switching to guided", () => {
    useAppStore.getState().startTour(1, "2d", ["a", "b"]);
    useAppStore.getState().setManualVarValue("a", 0.5);
    useAppStore.getState().setTourMode("guided");
    const t = useAppStore.getState().tour;
    expect(t.frozenVars).toEqual([]);
    expect(t.manualVar).toBeNull();
    expect(t.manualValue).toBe(0);
  });

  it("saveCurrentView and restoreView", () => {
    useAppStore.getState().startTour(3, "2d", ["a", "b"]);
    useAppStore.getState().setTourFrame(
      new Float64Array([1, 0, 0, 1]),
      new Float64Array([0.1, 0.2]),
      0,
    );
    const id = useAppStore.getState().saveCurrentView("origin");
    expect(useAppStore.getState().tour.savedViews).toHaveLength(1);
    useAppStore.getState().setTourFrame(
      new Float64Array([0, 1, 1, 0]),
      new Float64Array([0.3, 0.4]),
      0.5,
    );
    useAppStore.getState().restoreView(id);
    const after = useAppStore.getState().tour;
    expect(Array.from(after.basis ?? [])).toEqual([1, 0, 0, 1]);
    expect(after.isPlaying).toBe(false);
  });

  it("removeView", () => {
    useAppStore.getState().startTour(1, "2d", ["a", "b"]);
    useAppStore.getState().setTourFrame(
      new Float64Array([1, 0, 0, 1]),
      new Float64Array([0.1, 0.2]),
      0,
    );
    const id = useAppStore.getState().saveCurrentView("v");
    useAppStore.getState().removeView(id);
    expect(useAppStore.getState().tour.savedViews).toHaveLength(0);
  });

  it("addKeyframe adds a keyframe", () => {
    const basis = new Float64Array([1, 0, 0, 1]);
    const id = useAppStore.getState().addKeyframe(basis, "random", "test kf");
    const kfs = useAppStore.getState().tour.keyframes;
    expect(kfs).toHaveLength(1);
    expect(kfs[0]!.id).toBe(id);
    expect(kfs[0]!.name).toBe("test kf");
    expect(kfs[0]!.source).toBe("random");
    expect(Array.from(kfs[0]!.basis)).toEqual([1, 0, 0, 1]);
  });

  it("addKeyframe makes a copy of basis", () => {
    const basis = new Float64Array([1, 0, 0, 1]);
    useAppStore.getState().addKeyframe(basis, "random");
    basis[0] = 99;
    const kf = useAppStore.getState().tour.keyframes[0]!;
    expect(kf.basis[0]).toBe(1);
  });

  it("removeKeyframe removes by id", () => {
    const id1 = useAppStore.getState().addKeyframe(new Float64Array([1, 0, 0, 1]), "random", "kf1");
    const id2 = useAppStore.getState().addKeyframe(new Float64Array([0, 1, 1, 0]), "saved", "kf2");
    expect(useAppStore.getState().tour.keyframes).toHaveLength(2);
    useAppStore.getState().removeKeyframe(id1);
    const kfs = useAppStore.getState().tour.keyframes;
    expect(kfs).toHaveLength(1);
    expect(kfs[0]!.id).toBe(id2);
  });

  it("clearKeyframes removes all keyframes", () => {
    useAppStore.getState().addKeyframe(new Float64Array([1, 0, 0, 1]), "random");
    useAppStore.getState().addKeyframe(new Float64Array([0, 1, 1, 0]), "saved");
    useAppStore.getState().clearKeyframes();
    expect(useAppStore.getState().tour.keyframes).toHaveLength(0);
  });

  it("setScrubberT updates scrubber position", () => {
    useAppStore.getState().setScrubberT(0.5);
    expect(useAppStore.getState().tour.scrubberT).toBe(0.5);
  });

  it("setScrubbing toggles scrubbing state", () => {
    useAppStore.getState().setScrubbing(true);
    expect(useAppStore.getState().tour.scrubbing).toBe(true);
    useAppStore.getState().setScrubbing(false);
    expect(useAppStore.getState().tour.scrubbing).toBe(false);
  });

  it("addSavedViewAsKeyframe adds a saved view as keyframe", () => {
    useAppStore.getState().startTour(3, "2d", ["a", "b"]);
    useAppStore.getState().setTourFrame(
      new Float64Array([1, 0, 0, 1]),
      new Float64Array([0.1, 0.2]),
      0,
    );
    const viewId = useAppStore.getState().saveCurrentView("my view");
    useAppStore.getState().addSavedViewAsKeyframe(viewId);
    const kfs = useAppStore.getState().tour.keyframes;
    expect(kfs).toHaveLength(1);
    expect(kfs[0]!.source).toBe("saved");
    expect(kfs[0]!.name).toBe("my view");
  });

  it("startTour clears keyframes and scrubber state", () => {
    useAppStore.getState().addKeyframe(new Float64Array([1, 0, 0, 1]), "random");
    useAppStore.getState().setScrubberT(0.7);
    useAppStore.getState().setScrubbing(true);
    useAppStore.getState().startTour(1, "2d", ["a", "b"]);
    const t = useAppStore.getState().tour;
    expect(t.keyframes).toHaveLength(0);
    expect(t.scrubberT).toBe(0);
    expect(t.scrubbing).toBe(false);
  });

  it("stopTour clears keyframes and scrubber state", () => {
    useAppStore.getState().addKeyframe(new Float64Array([1, 0, 0, 1]), "random");
    useAppStore.getState().setScrubbing(true);
    useAppStore.getState().stopTour();
    const t = useAppStore.getState().tour;
    expect(t.keyframes).toHaveLength(0);
    expect(t.scrubbing).toBe(false);
  });

  it("setTourShape retargets activePanelId to compatible panel", () => {
    const scatterId = useAppStore.getState().addScatter("x", "y");
    const dotplotId = useAppStore.getState().addDotplot("x");
    useAppStore.getState().startTour(scatterId, "2d", ["x", "y"]);
    useAppStore.getState().setTourFrame(
      new Float64Array([1, 0, 0, 1]),
      new Float64Array([0.1, 0.2, 0.3, 0.4]),
      0,
    );
    useAppStore.getState().setTourShape("1d");
    const t = useAppStore.getState().tour;
    expect(t.shape).toBe("1d");
    expect(t.activePanelId).toBe(dotplotId);
    expect(t.basis).toBeNull();
    expect(t.proj).toBeNull();
  });

  it("setTourShape without compatible panel keeps activePanelId", () => {
    const scatterId = useAppStore.getState().addScatter("x", "y");
    useAppStore.getState().startTour(scatterId, "2d", ["x", "y"]);
    useAppStore.getState().setTourShape("1d");
    const t = useAppStore.getState().tour;
    expect(t.shape).toBe("1d");
    expect(t.activePanelId).toBe(scatterId);
  });

  it("setTourShape when idle just updates shape", () => {
    useAppStore.getState().setTourShape("1d");
    expect(useAppStore.getState().tour.shape).toBe("1d");
    expect(useAppStore.getState().tour.activePanelId).toBeNull();
  });
});
