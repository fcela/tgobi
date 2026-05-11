import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "@/store";

beforeEach(() => {
  useAppStore.getState().clear();
});

describe("HullsSlice", () => {
  it("toggles color and paint hull visibility", () => {
    expect(useAppStore.getState().hulls.colorGroups).toBe(false);
    expect(useAppStore.getState().hulls.paintGroups).toBe(false);
    useAppStore.getState().setColorHullsVisible(true);
    useAppStore.getState().setPaintHullsVisible(true);
    expect(useAppStore.getState().hulls.colorGroups).toBe(true);
    expect(useAppStore.getState().hulls.paintGroups).toBe(true);
  });

  it("clamps hull alpha", () => {
    useAppStore.getState().setHullAlpha(2);
    expect(useAppStore.getState().hulls.alpha).toBe(1);
    useAppStore.getState().setHullAlpha(0);
    expect(useAppStore.getState().hulls.alpha).toBe(0.05);
  });
});
