import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, act } from "@testing-library/react";
import { useAppStore } from "@/store";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeCategoricalColumn, makeNumericColumn } from "@/lib/data/columns";
import { bitGet } from "@/lib/brush/hitTest";
import { Scatter } from "@/plots/scatter/Scatter";

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
const setViewportSpy = vi.fn();
const dataBounds = { xMin: 1, xMax: 4, yMin: 1, yMax: 4 };
let viewBounds = { ...dataBounds };

vi.mock("@/plots/scatter/canvas2dRenderer", () => {
  function Canvas2DScatterRenderer() {
    return {
      attach: vi.fn(),
      detach: vi.fn(),
      setData: vi.fn(),
      setSize: vi.fn(),
      setViewport: setViewportSpy,
      getDataBounds: vi.fn(() => dataBounds),
      getViewBounds: vi.fn(() => viewBounds),
      draw: drawSpy,
      transform: transformSpy,
    };
  }
  return { Canvas2DScatterRenderer };
});

beforeEach(() => {
  drawSpy.mockClear();
  transformSpy.mockClear();
  setViewportSpy.mockClear();
  viewBounds = { ...dataBounds };
  setViewportSpy.mockImplementation((next) => {
    viewBounds = next ? { ...next } : { ...dataBounds };
  });
  useAppStore.getState().clear();
  useAppStore.getState().stopTour();
  useAppStore.getState().setActiveTool("brush");
  useAppStore.getState().resetSelectionFor(0);

  const df = new ArrayDataFrame([
    makeNumericColumn("x", new Float64Array([1, 2, 3, 4])),
    makeNumericColumn("y", new Float64Array([4, 3, 2, 1])),
  ]);
  useAppStore.getState().setData(df);
});

describe("Scatter", () => {
  it("renders a card with the var names in the header", () => {
    render(<Scatter panel={{ id: 1, kind: "scatter", x: "x", y: "y" }} />);
    expect(screen.getByText("x × y")).toBeInTheDocument();
  });

  it("calls renderer.draw at least once after mount", async () => {
    await act(async () => {
      render(<Scatter panel={{ id: 1, kind: "scatter", x: "x", y: "y" }} />);
    });
    expect(drawSpy).toHaveBeenCalled();
  });

  it("renders a point size slider and passes the value to the renderer", async () => {
    await act(async () => {
      render(<Scatter panel={{ id: 1, kind: "scatter", x: "x", y: "y" }} />);
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText("point size"), { target: { value: "6" } });
    });

    const visual = drawSpy.mock.calls.at(-1)?.[0];
    expect(visual?.pointSize).toBe(6);
  });

  it("zooms and resets the scatter viewport", async () => {
    await act(async () => {
      render(<Scatter panel={{ id: 1, kind: "scatter", x: "x", y: "y" }} />);
    });

    setViewportSpy.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByLabelText("zoom in"));
    });

    const zoomed = setViewportSpy.mock.calls.at(-1)?.[0];
    if (!zoomed) throw new Error("zoom did not set a viewport");
    expect(zoomed.xMax - zoomed.xMin).toBeCloseTo(2.4, 6);
    expect(zoomed.yMax - zoomed.yMin).toBeCloseTo(2.4, 6);

    await act(async () => {
      fireEvent.click(screen.getByLabelText("reset view"));
    });
    expect(setViewportSpy.mock.calls.at(-1)?.[0]).toBeNull();
  });

  it("persists scatter viewport changes when the panel is in the store", async () => {
    const id = useAppStore.getState().addScatter("x", "y");
    const panel = useAppStore.getState().plots.panels.find((p) => p.id === id);
    if (!panel || panel.kind !== "scatter") throw new Error("scatter panel not created");

    await act(async () => {
      render(<Scatter panel={panel} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText("zoom in"));
    });

    const stored = useAppStore.getState().plots.panels.find((p) => p.id === id);
    if (!stored || stored.kind !== "scatter") throw new Error("scatter panel missing");
    expect(stored.viewport).toBeDefined();
  });

  it("pans the scatter viewport with shift-drag", async () => {
    await act(async () => {
      render(<Scatter panel={{ id: 1, kind: "scatter", x: "x", y: "y" }} />);
    });
    const canvas = document.querySelector("canvas")!;
    Object.defineProperty(canvas, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 500, height: 500, right: 500, bottom: 500 }),
    });

    setViewportSpy.mockClear();
    await act(async () => {
      fireEvent.mouseDown(canvas, { clientX: 100, clientY: 100, shiftKey: true });
      fireEvent.mouseMove(canvas, { clientX: 144, clientY: 144 });
    });

    const panned = setViewportSpy.mock.calls.at(-1)?.[0];
    if (!panned) throw new Error("pan did not set a viewport");
    expect(panned.xMin).toBeLessThan(dataBounds.xMin);
    expect(panned.yMin).toBeGreaterThan(dataBounds.yMin);
  });

  it("emits removePanel when the close button is clicked", async () => {
    useAppStore.getState().addScatter("x", "y"); // ensure id 1 exists
    render(<Scatter panel={{ id: 1, kind: "scatter", x: "x", y: "y" }} />);
    const closeBtn = screen.getByLabelText(/remove plot/i);
    closeBtn.click();
    expect(useAppStore.getState().plots.panels.find((p) => p.id === 1)).toBeUndefined();
  });

  it("pins identified rows when identify mode clicks a point", async () => {
    useAppStore.getState().setActiveTool("identify");
    await act(async () => {
      render(<Scatter panel={{ id: 1, kind: "scatter", x: "x", y: "y" }} />);
    });
    const canvas = document.querySelector("canvas")!;
    Object.defineProperty(canvas, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 500, height: 500, right: 500, bottom: 500 }),
    });

    await act(async () => {
      fireEvent.mouseDown(canvas, { clientX: 2, clientY: 3 });
    });

    expect(bitGet(useAppStore.getState().tools.pinnedRows, 1)).toBe(true);
    expect(await screen.findByText("row 2")).toBeInTheDocument();
  });

  it("passes visible edge overlays to the renderer", async () => {
    useAppStore.getState().connectRowsInOrder();
    await act(async () => {
      render(<Scatter panel={{ id: 1, kind: "scatter", x: "x", y: "y" }} />);
    });

    const edgeOverlay = drawSpy.mock.calls.at(-1)?.[2];
    expect(edgeOverlay?.edges.source.length).toBe(3);
    expect(edgeOverlay?.alpha).toBe(useAppStore.getState().edges.alpha);
  });

  it("produces per-edge colors in endpoint paint mode", async () => {
    useAppStore.getState().connectRowsInOrder();
    useAppStore.getState().setEdgeColorMode("endpoint");
    const { paint } = useAppStore.getState().selection;
    paint[0] = 1;
    paint[1] = 2;
    useAppStore.getState().setSelectionPaint(new Uint8Array(paint));
    await act(async () => {
      render(<Scatter panel={{ id: 1, kind: "scatter", x: "x", y: "y" }} />);
    });

    const edgeOverlay = drawSpy.mock.calls.at(-1)?.[2];
    expect(edgeOverlay?.perEdgeColors).toBeDefined();
    expect(edgeOverlay!.perEdgeColors!.length).toBe(3);
  });

  it("passes categorical color hulls to the renderer", async () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([0, 1, 0, 5, 6, 5])),
      makeNumericColumn("y", new Float64Array([0, 0, 1, 0, 0, 1])),
      makeCategoricalColumn("g", new Int32Array([0, 0, 0, 1, 1, 1]), ["a", "b"]),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setColorEncoding({ kind: "byVar", var: "g", scale: "categorical" });
    useAppStore.getState().setColorHullsVisible(true);

    await act(async () => {
      render(<Scatter panel={{ id: 1, kind: "scatter", x: "x", y: "y" }} />);
    });

    const hullOverlay = drawSpy.mock.calls.at(-1)?.[3];
    expect(hullOverlay?.hulls).toHaveLength(2);
  });

  it("respects edge-to-node linking when brushing edges", async () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([0, 10, 20])),
      makeNumericColumn("y", new Float64Array([0, 0, 0])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().setEdgesLayer({
      source: Int32Array.from([0]),
      target: Int32Array.from([2]),
      directed: false,
    }, "custom");
    useAppStore.getState().setBrushTarget("edges");
    useAppStore.getState().setLinkEdgesToNodes(false);

    await act(async () => {
      render(<Scatter panel={{ id: 1, kind: "scatter", x: "x", y: "y" }} />);
    });
    const canvas = document.querySelector("canvas")!;
    Object.defineProperty(canvas, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 500, height: 500, right: 500, bottom: 500 }),
    });

    fireEvent.mouseDown(canvas, { clientX: 9, clientY: -1 });
    fireEvent.mouseMove(canvas, { clientX: 11, clientY: 1 });

    expect(bitGet(useAppStore.getState().edges.selection.mask, 0)).toBe(true);
    expect(bitGet(useAppStore.getState().selection.mask, 0)).toBe(false);
    expect(bitGet(useAppStore.getState().selection.mask, 2)).toBe(false);
  });

  it("adds an edge by dragging point to point in line add mode", async () => {
    useAppStore.getState().setEdgeEditMode("add");
    await act(async () => {
      render(<Scatter panel={{ id: 1, kind: "scatter", x: "x", y: "y" }} />);
    });
    const canvas = document.querySelector("canvas")!;
    Object.defineProperty(canvas, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 500, height: 500, right: 500, bottom: 500 }),
    });

    fireEvent.mouseDown(canvas, { clientX: 1, clientY: 4 });
    fireEvent.mouseMove(canvas, { clientX: 4, clientY: 1 });
    fireEvent.mouseUp(canvas, { clientX: 4, clientY: 1 });

    expect(Array.from(useAppStore.getState().edges.layer?.source ?? [])).toEqual([0]);
    expect(Array.from(useAppStore.getState().edges.layer?.target ?? [])).toEqual([3]);
  });

  it("deletes the nearest edge in line delete mode", async () => {
    useAppStore.getState().setEdgesLayer({
      source: Int32Array.from([0]),
      target: Int32Array.from([3]),
      directed: false,
    }, "custom");
    useAppStore.getState().setEdgeEditMode("delete");
    await act(async () => {
      render(<Scatter panel={{ id: 1, kind: "scatter", x: "x", y: "y" }} />);
    });
    const canvas = document.querySelector("canvas")!;
    Object.defineProperty(canvas, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 500, height: 500, right: 500, bottom: 500 }),
    });

    fireEvent.mouseDown(canvas, { clientX: 2.5, clientY: 2.5 });

    expect(useAppStore.getState().edges.layer).toBeNull();
  });
});

describe("Scatter (tour mode)", () => {
  it("uses tour.proj when activePanelId matches and shape is 2d", () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2, 3, 4])),
      makeNumericColumn("y", new Float64Array([4, 3, 2, 1])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().startTour(1, "2d", ["x", "y"]);
    useAppStore.getState().setTourFrame(
      new Float64Array([1, 0, 0, 1]),
      new Float64Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]),
      0,
    );
    render(<Scatter panel={{ id: 1, kind: "scatter", x: "x", y: "y" }} />);
    expect(screen.getByText(/^tour: x, y$/)).toBeInTheDocument();
  });

  it("brush hit-testing uses tour projection coordinates", async () => {
    const df = new ArrayDataFrame([
      makeNumericColumn("x", new Float64Array([1, 2, 3, 4])),
      makeNumericColumn("y", new Float64Array([4, 3, 2, 1])),
    ]);
    useAppStore.getState().setData(df);
    useAppStore.getState().startTour(1, "2d", ["x", "y"]);
    useAppStore.getState().setTourFrame(
      new Float64Array([1, 0, 0, 1]),
      new Float64Array([100, 100, 200, 200, 300, 300, 400, 400]),
      0,
    );

    await act(async () => {
      render(<Scatter panel={{ id: 1, kind: "scatter", x: "x", y: "y" }} />);
    });
    const canvas = document.querySelector("canvas")!;
    Object.defineProperty(canvas, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 500, height: 500, right: 500, bottom: 500 }),
    });

    fireEvent.mouseDown(canvas, { clientX: 90, clientY: 90 });
    fireEvent.mouseMove(canvas, { clientX: 110, clientY: 110 });

    const mask = useAppStore.getState().selection.mask;
    expect(bitGet(mask, 0)).toBe(true);
    expect(bitGet(mask, 1)).toBe(false);
  });
});
