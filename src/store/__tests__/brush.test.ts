import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";

beforeEach(() => {
  useAppStore.getState().clear();
  useAppStore.getState().setActiveBrush(null, null);
  useAppStore.getState().setBrushMode("transient");
  useAppStore.getState().setBrushTool("rectangle");
  useAppStore.getState().setPaintColor(1);
  useAppStore.getState().setPaintShape(1);
});

describe("BrushSlice", () => {
  it("starts in transient mode with no active rect", () => {
    const b = useAppStore.getState().brush;
    expect(b.mode).toBe("transient");
    expect(b.tool).toBe("rectangle");
    expect(b.paintShape).toBe(1);
    expect(b.activeRect).toBeNull();
    expect(b.activePath).toBeNull();
    expect(b.activePanelId).toBeNull();
  });

  it("setBrushMode flips to persistent", () => {
    useAppStore.getState().setBrushMode("persistent");
    expect(useAppStore.getState().brush.mode).toBe("persistent");
  });

  it("setBrushTool updates geometry", () => {
    useAppStore.getState().setBrushTool("lasso");
    expect(useAppStore.getState().brush.tool).toBe("lasso");
  });

  it("setPaintColor updates", () => {
    useAppStore.getState().setPaintColor(3);
    expect(useAppStore.getState().brush.paintColor).toBe(3);
  });

  it("setPaintShape updates", () => {
    useAppStore.getState().setPaintShape(4);
    expect(useAppStore.getState().brush.paintShape).toBe(4);
  });

  it("setActiveBrush sets and clears the drag rect", () => {
    const path = [{ x: 1, y: 2 }, { x: 30, y: 40 }];
    useAppStore.getState().setActiveBrush(7, { x0: 1, y0: 2, x1: 30, y1: 40 }, path);
    expect(useAppStore.getState().brush.activeRect).toEqual({ x0: 1, y0: 2, x1: 30, y1: 40 });
    expect(useAppStore.getState().brush.activePath).toEqual(path);
    expect(useAppStore.getState().brush.activePanelId).toBe(7);
    useAppStore.getState().setActiveBrush(null, null);
    expect(useAppStore.getState().brush.activeRect).toBeNull();
    expect(useAppStore.getState().brush.activePath).toBeNull();
    expect(useAppStore.getState().brush.activePanelId).toBeNull();
  });

  it("setBrushTarget updates target", () => {
    expect(useAppStore.getState().brush.target).toBe("nodes");
    useAppStore.getState().setBrushTarget("edges");
    expect(useAppStore.getState().brush.target).toBe("edges");
    useAppStore.getState().setBrushTarget("both");
    expect(useAppStore.getState().brush.target).toBe("both");
  });
});
