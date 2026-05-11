import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useAppStore } from "@/store";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeCategoricalColumn, makeNumericColumn } from "@/lib/data/columns";
import { PlotGrid } from "@/app/PlotGrid";

// ResizeObserver is not implemented in jsdom; provide a minimal stub.
(global as unknown as Record<string, unknown>).ResizeObserver =
  (global as unknown as Record<string, unknown>).ResizeObserver ??
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

// Make requestAnimationFrame synchronous so draw() is called without needing
// to advance timers or wait for an actual animation frame.
vi.stubGlobal(
  "requestAnimationFrame",
  (cb: FrameRequestCallback) => { cb(0); return 0; },
);

const drawSpy = vi.fn();
const transformSpy = vi.fn(() => ({
  toPx: (x: number, y: number) => ({ x, y }),
  toData: (x: number, y: number) => ({ x, y }),
}));

vi.mock("@/plots/scatter/canvas2dRenderer", () => {
  function Canvas2DScatterRenderer() {
    return {
      attach: vi.fn(),
      detach: vi.fn(),
      setData: vi.fn(),
      setSize: vi.fn(),
      draw: drawSpy,
      transform: transformSpy,
    };
  }
  return { Canvas2DScatterRenderer };
});

beforeEach(() => {
  drawSpy.mockClear();
  transformSpy.mockClear();
  useAppStore.getState().clear();
  useAppStore.getState().clearPanels();
});

describe("PlotGrid", () => {
  it("shows the empty hint when no panels", () => {
    render(<PlotGrid />);
    expect(screen.getByText(/use/i)).toBeInTheDocument();
    expect(screen.getByText(/\+ plot/i)).toBeInTheDocument();
  });

  it("renders one Scatter card per panel", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2, 3])),
      makeNumericColumn("y", new Float64Array([3, 2, 1])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().addScatter("x", "y");
    useAppStore.getState().addScatter("y", "x");
    render(<PlotGrid />);
    const headings = screen.getAllByText(/×/);
    expect(headings.length).toBeGreaterThanOrEqual(2);
  });

  it("renders barchart panels", () => {
    const df = new ArrayDataFrame([
      makeCategoricalColumn("g", new Int32Array([0, 1, 0]), ["a", "b"]),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().addBarchart("g");
    render(<PlotGrid />);
    expect(screen.getByText("bar: g")).toBeInTheDocument();
  });

  it("renders dotplot panels", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("v", new Float64Array([1, 2, 3, 4, 5])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().addDotplot("v");
    render(<PlotGrid />);
    expect(screen.getByText("dot: v")).toBeInTheDocument();
  });

  it("renders scatmat panels", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2, 3])),
      makeNumericColumn("y", new Float64Array([3, 2, 1])),
      makeNumericColumn("z", new Float64Array([2, 1, 3])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().addScatmat(["x", "y", "z"]);
    render(<PlotGrid />);
    expect(screen.getAllByText(/scatmat/i).length).toBeGreaterThan(0);
  });

  it("renders parcoords panels", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2, 3])),
      makeNumericColumn("y", new Float64Array([3, 2, 1])),
      makeNumericColumn("z", new Float64Array([2, 1, 3])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().addParcoords(["x", "y", "z"]);
    render(<PlotGrid />);
    expect(screen.getAllByText(/parcoords/i).length).toBeGreaterThan(0);
  });
});
