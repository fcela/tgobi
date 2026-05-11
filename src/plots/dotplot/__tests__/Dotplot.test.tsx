import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Dotplot } from "@/plots/dotplot/Dotplot";
import { useAppStore } from "@/store";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeNumericColumn, makeCategoricalColumn } from "@/lib/data/columns";
import { bitGet } from "@/lib/brush/hitTest";

beforeEach(() => {
  useAppStore.getState().clear();
  useAppStore.getState().stopTour();
  useAppStore.getState().clearPanels();
  useAppStore.getState().setBrushMode("transient");
  useAppStore.getState().setPaintColor(1);
  useAppStore.getState().setPaintShape(1);
});

describe("Dotplot", () => {
  it("renders an SVG with the variable name in the header", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("tars1", new Float64Array([1, 2, 3, 4, 5])),
    ]);
    useAppStore.getState().setData(df);
    render(<Dotplot panel={{ id: 1, kind: "dotplot", variable: "tars1", bins: 5 }} />);
    expect(screen.getByText("dot: tars1")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /dotplot tars1/i })).toBeInTheDocument();
  });

  it("removes the panel via the close button", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2, 3])),
    ]);
    useAppStore.getState().setData(df);
    const id = useAppStore.getState().addDotplot("x");
    render(<Dotplot panel={{ id, kind: "dotplot", variable: "x", bins: 5 }} />);
    fireEvent.click(screen.getByLabelText(`remove plot ${id}`));
    expect(useAppStore.getState().plots.panels.map((p) => p.id)).not.toContain(id);
  });

  it("renders one circle per non-missing row for clean numeric data", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("v", new Float64Array([10, 20, 30, 40, 50])),
    ]);
    useAppStore.getState().setData(df);
    render(<Dotplot panel={{ id: 1, kind: "dotplot", variable: "v", bins: 5 }} />);
    const dots = screen.getAllByTestId(/^dot-v-/);
    expect(dots).toHaveLength(5);
  });

  it("shows non-numeric message for categorical variable", () => {
    const df = new ArrayDataFrame([
      makeCategoricalColumn("g", new Int32Array([0, 1, 0]), ["a", "b"]),
    ]);
    useAppStore.getState().setData(df);
    render(<Dotplot panel={{ id: 1, kind: "dotplot", variable: "g", bins: 10 }} />);
    expect(screen.getByText(/non-numeric/i)).toBeInTheDocument();
  });

  it("brushes all rows in the clicked bucket", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("v", new Float64Array([1, 1, 2, 3])),
    ]);
    useAppStore.getState().setData(df);
    render(<Dotplot panel={{ id: 1, kind: "dotplot", variable: "v", bins: 2 }} />);
    // Click the first dot in the first bucket
    const firstDot = screen.getByTestId("dot-v-0");
    fireEvent.mouseDown(firstDot);
    const mask = useAppStore.getState().selection.mask;
    // row 0 should be selected (it's in the first bin)
    expect(bitGet(mask, 0)).toBe(true);
  });

  it("persistent brushing paints rows on mouseup", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("v", new Float64Array([1, 2, 3, 4])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setBrushMode("persistent");
    useAppStore.getState().setPaintColor(2);
    useAppStore.getState().setPaintShape(4);
    render(<Dotplot panel={{ id: 1, kind: "dotplot", variable: "v", bins: 4 }} />);
    const firstDot = screen.getByTestId("dot-v-0");
    fireEvent.mouseDown(firstDot);
    fireEvent.mouseUp(screen.getByLabelText("dotplot v"));
    // row 0 should be painted with color 2
    expect(useAppStore.getState().selection.paint[0]).toBe(2);
    expect(useAppStore.getState().selection.shape[0]).toBe(4);
  });
});

describe("Dotplot (tour mode)", () => {
  it("uses tour.proj when activePanelId matches and shape is 1d", () => {
    const df = new ArrayDataFrame([makeNumericColumn("x", new Float64Array([1, 2, 3, 4]))]);
    useAppStore.getState().setData(df);
    useAppStore.getState().startTour(1, "1d", ["x"]);
    useAppStore.getState().setTourFrame(
      new Float64Array([1]),
      new Float64Array([0.1, 0.2, 0.3, 0.4]),
      0,
    );
    render(<Dotplot panel={{ id: 1, kind: "dotplot", variable: "x", bins: 10 }} />);
    expect(screen.getAllByText(/^tour: x$/)[0]).toBeInTheDocument();
  });
});
