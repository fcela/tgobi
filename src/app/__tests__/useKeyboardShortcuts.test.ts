import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useKeyboardShortcuts } from "@/app/useKeyboardShortcuts";
import { useAppStore } from "@/store";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeNumericColumn } from "@/lib/data/columns";

beforeEach(() => {
  useAppStore.getState().clear();
  useAppStore.getState().clearPanels();
  useAppStore.getState().setBrushMode("transient");
  useAppStore.getState().setActiveTool("brush");
});

describe("useKeyboardShortcuts", () => {
  it("switches to brush tool on 'b'", () => {
    useAppStore.getState().setActiveTool("identify");
    renderHook(() => useKeyboardShortcuts());
    fireEvent.keyDown(window, { key: "b" });
    expect(useAppStore.getState().tools.active).toBe("brush");
  });

  it("switches to identify tool on 'i'", () => {
    renderHook(() => useKeyboardShortcuts());
    fireEvent.keyDown(window, { key: "i" });
    expect(useAppStore.getState().tools.active).toBe("identify");
  });

  it("toggles brush mode on 't'", () => {
    renderHook(() => useKeyboardShortcuts());
    fireEvent.keyDown(window, { key: "t" });
    expect(useAppStore.getState().brush.mode).toBe("persistent");
    fireEvent.keyDown(window, { key: "t" });
    expect(useAppStore.getState().brush.mode).toBe("transient");
  });

  it("restores all rows on 'r'", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2, 3])),
    ]);
    useAppStore.getState().setData(df);
    const sh = new Uint8Array(1);
    sh[0] = 0b111;
    useAppStore.getState().setSelectionShadow(sh);
    renderHook(() => useKeyboardShortcuts());
    fireEvent.keyDown(window, { key: "r" });
    expect(useAppStore.getState().selection.shadow[0]).toBe(0);
  });

  it("ignores keys when focus is in an input", () => {
    useAppStore.getState().setActiveTool("identify");
    renderHook(() => useKeyboardShortcuts());
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "b" });
    expect(useAppStore.getState().tools.active).toBe("identify");
    document.body.removeChild(input);
  });
});

import { fireEvent } from "@testing-library/react";
