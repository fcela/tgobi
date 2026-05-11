import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";

beforeEach(() => {
  useAppStore.getState().clear();
  useAppStore.getState().setColorEncoding({ kind: "fixed" });
  useAppStore.getState().setColorPalette("tableau10");
});

describe("ColorSlice", () => {
  it("defaults to fixed + tableau10", () => {
    const c = useAppStore.getState().color;
    expect(c.encoding.kind).toBe("fixed");
    expect(c.palette).toBe("tableau10");
  });

  it("setColorEncoding to byVar", () => {
    useAppStore.getState().setColorEncoding({ kind: "byVar", var: "species", scale: "categorical" });
    const c = useAppStore.getState().color;
    expect(c.encoding).toEqual({ kind: "byVar", var: "species", scale: "categorical" });
  });

  it("setColorPalette", () => {
    useAppStore.getState().setColorPalette("viridis");
    expect(useAppStore.getState().color.palette).toBe("viridis");
  });
});
