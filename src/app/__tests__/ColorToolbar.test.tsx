import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useAppStore } from "@/store";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeNumericColumn, makeCategoricalColumn } from "@/lib/data/columns";
import { ColorToolbar } from "@/app/ColorToolbar";

beforeEach(() => {
  useAppStore.getState().clear();
  useAppStore.getState().setColorEncoding({ kind: "fixed" });
  useAppStore.getState().setColorPalette("tableau10");
});

describe("ColorToolbar", () => {
  it("renders encoding select; switching to byVar reveals var picker", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2])),
      makeCategoricalColumn("g", new Int32Array([0, 1]), ["a", "b"]),
    ]);
    useAppStore.getState().setData(df);
    render(<ColorToolbar />);
    fireEvent.change(screen.getByLabelText(/color encoding/i), { target: { value: "byVar" } });
    const sel = screen.getByLabelText(/color variable/i) as HTMLSelectElement;
    expect(Array.from(sel.options).map((o) => o.value)).toEqual(["x", "g"]);
    fireEvent.change(sel, { target: { value: "g" } });
    const enc = useAppStore.getState().color.encoding;
    expect(enc).toEqual({ kind: "byVar", var: "g", scale: "categorical" });
  });

  it("setColorPalette via select", () => {
    render(<ColorToolbar />);
    fireEvent.change(screen.getByLabelText(/palette/i), { target: { value: "viridis" } });
    expect(useAppStore.getState().color.palette).toBe("viridis");
  });

  it("toggles hull overlays", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2, 3])),
      makeCategoricalColumn("g", new Int32Array([0, 1, 0]), ["a", "b"]),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setColorEncoding({ kind: "byVar", var: "g", scale: "categorical" });

    render(<ColorToolbar />);
    fireEvent.click(screen.getByRole("checkbox", { name: /^color$/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /^paint$/i }));
    expect(useAppStore.getState().hulls.colorGroups).toBe(true);
    expect(useAppStore.getState().hulls.paintGroups).toBe(true);
  });
});
