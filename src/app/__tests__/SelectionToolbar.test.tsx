import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useAppStore } from "@/store";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeNumericColumn } from "@/lib/data/columns";
import { SelectionToolbar } from "@/app/SelectionToolbar";

beforeEach(() => {
  useAppStore.getState().clear();
  const df = new ArrayDataFrame([makeNumericColumn("x", new Float64Array([1, 2, 3, 4]))]);
  useAppStore.getState().setData(df);
  // mark rows 0 and 2 selected
  const mask = new Uint8Array([0b00000101]);
  useAppStore.getState().setSelectionMask(mask);
});

describe("SelectionToolbar", () => {
  it("exclude moves the selected rows into the shadow mask", () => {
    render(<SelectionToolbar />);
    fireEvent.click(screen.getByRole("button", { name: /^exclude$/i }));
    const sh = useAppStore.getState().selection.shadow;
    expect(sh[0]! & 0b101).toBe(0b101);
  });

  it("restore all clears shadow", () => {
    render(<SelectionToolbar />);
    fireEvent.click(screen.getByRole("button", { name: /^exclude$/i }));
    fireEvent.click(screen.getByRole("button", { name: /restore all/i }));
    expect(Array.from(useAppStore.getState().selection.shadow)).toEqual([0]);
  });

  it("tool toggle switches active tool", () => {
    render(<SelectionToolbar />);
    fireEvent.click(screen.getByRole("button", { name: /identify/i }));
    expect(useAppStore.getState().tools.active).toBe("identify");
  });
});
