import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";

beforeEach(() => {
  useAppStore.getState().clear();
  useAppStore.getState().resetSelectionFor(0);
});

describe("SelectionSlice", () => {
  it("starts with empty masks", () => {
    const s = useAppStore.getState().selection;
    expect(s.mask.length).toBe(0);
    expect(s.paint.length).toBe(0);
    expect(s.shape.length).toBe(0);
    expect(s.shadow.length).toBe(0);
  });

  it("resetSelectionFor allocates packed bit + byte arrays", () => {
    useAppStore.getState().resetSelectionFor(20);
    const s = useAppStore.getState().selection;
    expect(s.mask.length).toBe(Math.ceil(20 / 8));   // packed bits => 3 bytes
    expect(s.paint.length).toBe(20);                 // byte per row
    expect(s.shape.length).toBe(20);                 // byte per row
    expect(s.shadow.length).toBe(Math.ceil(20 / 8)); // packed bits => 3 bytes
    // all zero
    expect(s.mask.every((b) => b === 0)).toBe(true);
    expect(s.paint.every((b) => b === 0)).toBe(true);
    expect(s.shape.every((b) => b === 0)).toBe(true);
    expect(s.shadow.every((b) => b === 0)).toBe(true);
  });

  it("setSelectionMask replaces and is referentially distinct", () => {
    useAppStore.getState().resetSelectionFor(10);
    const fresh = new Uint8Array([0xff, 0x03]);
    useAppStore.getState().setSelectionMask(fresh);
    expect(useAppStore.getState().selection.mask).toBe(fresh);
  });

  it("setSelectionPaint replaces", () => {
    useAppStore.getState().resetSelectionFor(3);
    const p = new Uint8Array([1, 2, 3]);
    useAppStore.getState().setSelectionPaint(p);
    expect(useAppStore.getState().selection.paint).toBe(p);
  });

  it("setSelectionShape replaces", () => {
    useAppStore.getState().resetSelectionFor(3);
    const sh = new Uint8Array([1, 2, 3]);
    useAppStore.getState().setSelectionShape(sh);
    expect(useAppStore.getState().selection.shape).toBe(sh);
  });

  it("setSelectionShadow replaces", () => {
    useAppStore.getState().resetSelectionFor(8);
    const sh = new Uint8Array([0x0f]);
    useAppStore.getState().setSelectionShadow(sh);
    expect(useAppStore.getState().selection.shadow).toBe(sh);
  });
});
