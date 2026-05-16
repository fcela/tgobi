import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Boxplot } from "@/plots/boxplot/Boxplot";
import { useAppStore } from "@/store";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeCategoricalColumn, makeNumericColumn } from "@/lib/data/columns";
import { bitGet } from "@/lib/brush/hitTest";

beforeEach(() => {
  useAppStore.getState().clear();
  useAppStore.getState().clearPanels();
  useAppStore.getState().setBrushMode("transient");
  useAppStore.getState().setPaintColor(1);
  useAppStore.getState().setPaintShape(1);
});

describe("Boxplot", () => {
  it("renders a single boxplot for a numeric variable", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
    ]);
    useAppStore.getState().setData(df);
    render(<Boxplot panel={{ id: 1, kind: "boxplot", variable: "x", groupVar: null }} />);
    expect(screen.getByText("box: x")).toBeInTheDocument();
    expect(screen.getByTestId("box-x-0")).toBeInTheDocument();
  });

  it("renders side-by-side boxplots when grouped by a categorical variable", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
      makeCategoricalColumn("g", new Int32Array([0, 0, 0, 0, 0, 1, 1, 1, 1, 1]), ["a", "b"]),
    ]);
    useAppStore.getState().setData(df);
    render(<Boxplot panel={{ id: 1, kind: "boxplot", variable: "x", groupVar: "g" }} />);
    expect(screen.getByText("box: x by g")).toBeInTheDocument();
    expect(screen.getByTestId("box-x-0")).toBeInTheDocument();
    expect(screen.getByTestId("box-x-1")).toBeInTheDocument();
  });

  it("renders outlier dots for values outside 1.5*IQR", () => {
    const values = new Float64Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 100]);
    const df = new ArrayDataFrame([
      makeNumericColumn("x", values),
    ]);
    useAppStore.getState().setData(df);
    render(<Boxplot panel={{ id: 1, kind: "boxplot", variable: "x", groupVar: null }} />);
    const outliers = screen.getAllByTestId(/^outlier-x-0-/);
    expect(outliers.length).toBeGreaterThanOrEqual(1);
  });

  it("brushes rows in clicked box region", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setActiveTool("brush");
    const { container } = render(<Boxplot panel={{ id: 1, kind: "boxplot", variable: "x", groupVar: null }} />);
    const boxRect = container.querySelector("[data-box-index]")!;
    fireEvent.mouseDown(boxRect);
    const mask = useAppStore.getState().selection.mask;
    let anySelected = false;
    for (let i = 0; i < 10; i++) {
      if (bitGet(mask, i)) anySelected = true;
    }
    expect(anySelected).toBe(true);
  });

  it("persistent brushing paints rows on mouseup", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setBrushMode("persistent");
    useAppStore.getState().setPaintColor(3);
    useAppStore.getState().setPaintShape(3);
    const { container } = render(<Boxplot panel={{ id: 1, kind: "boxplot", variable: "x", groupVar: null }} />);
    const boxRect = container.querySelector("[data-box-index]")!;
    fireEvent.mouseDown(boxRect);
    fireEvent.mouseUp(boxRect);
    const paint = useAppStore.getState().selection.paint;
    let anyPainted = false;
    for (let i = 0; i < 10; i++) {
      if (paint[i] === 3) anyPainted = true;
    }
    expect(anyPainted).toBe(true);
  });

  it("shows group variable selector when categorical vars exist", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2, 3, 4, 5])),
      makeCategoricalColumn("g", new Int32Array([0, 0, 1, 1, 1]), ["a", "b"]),
    ]);
    useAppStore.getState().setData(df);
    render(<Boxplot panel={{ id: 1, kind: "boxplot", variable: "x", groupVar: null }} />);
    expect(screen.getByLabelText(/group variable for x boxplot/i)).toBeInTheDocument();
  });

  it("does not show group selector when no categorical vars", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2, 3, 4, 5])),
    ]);
    useAppStore.getState().setData(df);
    render(<Boxplot panel={{ id: 1, kind: "boxplot", variable: "x", groupVar: null }} />);
    expect(screen.queryByLabelText(/group variable/i)).not.toBeInTheDocument();
  });
});
