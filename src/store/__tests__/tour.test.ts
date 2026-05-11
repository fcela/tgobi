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
    expect(t.ppClassVar).toBeNull();
    expect(t.ppValue).toBeNull();
    expect(t.isPlaying).toBe(false);
    expect(t.frozenVars).toEqual([]);
    expect(t.savedViews).toEqual([]);
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
    useAppStore.getState().setTourPpClassVar("species");
    useAppStore.getState().setTourFrame(
      new Float64Array([1, 0, 0, 1]),
      new Float64Array([0.1, 0.2, 0.3, 0.4]),
      0.5,
      1.25,
    );
    const t = useAppStore.getState().tour;
    expect(t.mode).toBe("pp");
    expect(t.ppIndex).toBe("lda");
    expect(t.ppClassVar).toBe("species");
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
});
