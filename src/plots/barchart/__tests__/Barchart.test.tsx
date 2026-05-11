import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Barchart } from "@/plots/barchart/Barchart";
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

describe("Barchart", () => {
  it("renders categorical level bars", () => {
    const df = new ArrayDataFrame([
      makeCategoricalColumn("g", new Int32Array([0, 1, 0, 2]), ["a", "b", "c"]),
    ]);
    useAppStore.getState().setData(df);
    render(<Barchart panel={{ id: 1, kind: "barchart", variable: "g", bins: 10 }} />);
    expect(screen.getByText("bar: g")).toBeInTheDocument();
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.getByText("b")).toBeInTheDocument();
    expect(screen.getByText("c")).toBeInTheDocument();
  });

  it("renders numeric bins", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([0, 1, 2, 3, 4, 5])),
    ]);
    useAppStore.getState().setData(df);
    render(<Barchart panel={{ id: 1, kind: "barchart", variable: "x", bins: 3 }} />);
    expect(screen.getAllByTestId(/^bar-x-/)).toHaveLength(3);
  });

  it("renders a bin slider for numeric barcharts and updates panel bins", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([0, 1, 2, 3, 4, 5])),
    ]);
    useAppStore.getState().setData(df);
    const id = useAppStore.getState().addBarchart("x");
    render(<Barchart panel={{ id, kind: "barchart", variable: "x", bins: 10 }} />);
    fireEvent.change(screen.getByLabelText(/bins for x/i), { target: { value: "24" } });
    expect(useAppStore.getState().plots.panels.find((p) => p.id === id)).toMatchObject({ bins: 24 });
  });

  it("does not render a bin slider for categorical barcharts", () => {
    const df = new ArrayDataFrame([
      makeCategoricalColumn("g", new Int32Array([0, 1, 0, 2]), ["a", "b", "c"]),
    ]);
    useAppStore.getState().setData(df);
    render(<Barchart panel={{ id: 1, kind: "barchart", variable: "g", bins: 10 }} />);
    expect(screen.queryByLabelText(/bins for g/i)).not.toBeInTheDocument();
  });

  it("brushes all rows in the clicked bar", () => {
    const df = new ArrayDataFrame([
      makeCategoricalColumn("g", new Int32Array([0, 1, 0, 2]), ["a", "b", "c"]),
    ]);
    useAppStore.getState().setData(df);
    render(<Barchart panel={{ id: 1, kind: "barchart", variable: "g", bins: 10 }} />);
    fireEvent.mouseDown(screen.getByTestId("bar-g-0"));
    const mask = useAppStore.getState().selection.mask;
    expect(bitGet(mask, 0)).toBe(true);
    expect(bitGet(mask, 2)).toBe(true);
    expect(bitGet(mask, 1)).toBe(false);
  });

  it("persistent brushing paints rows on mouseup", () => {
    const df = new ArrayDataFrame([
      makeCategoricalColumn("g", new Int32Array([0, 1, 0, 2]), ["a", "b", "c"]),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setBrushMode("persistent");
    useAppStore.getState().setPaintColor(3);
    useAppStore.getState().setPaintShape(3);
    render(<Barchart panel={{ id: 1, kind: "barchart", variable: "g", bins: 10 }} />);
    fireEvent.mouseDown(screen.getByTestId("bar-g-1"));
    fireEvent.mouseUp(screen.getByLabelText("barchart g"));
    expect(useAppStore.getState().selection.paint[1]).toBe(3);
    expect(useAppStore.getState().selection.shape[1]).toBe(3);
  });

  it("persistent brushing still paints when mouseup happens outside the SVG", () => {
    const df = new ArrayDataFrame([
      makeCategoricalColumn("g", new Int32Array([0, 1, 0, 2]), ["a", "b", "c"]),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setBrushMode("persistent");
    useAppStore.getState().setPaintColor(2);
    render(<Barchart panel={{ id: 1, kind: "barchart", variable: "g", bins: 10 }} />);
    const svg = screen.getByLabelText("barchart g");
    fireEvent.mouseDown(screen.getByTestId("bar-g-2"));
    fireEvent.mouseLeave(svg);
    fireEvent.mouseUp(window);
    expect(useAppStore.getState().selection.paint[3]).toBe(2);
  });
});
