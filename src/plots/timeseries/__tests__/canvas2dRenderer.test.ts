import { describe, it, expect, beforeEach } from "vitest";
import { TimeseriesRenderer } from "@/plots/timeseries/canvas2dRenderer";
import type { TimeseriesRenderState, TimeseriesEdgeOverlay } from "@/plots/timeseries/canvas2dRenderer";

let canvas: HTMLCanvasElement;
let r: TimeseriesRenderer;

beforeEach(() => {
  canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 300;
  r = new TimeseriesRenderer();
  r.attach(canvas);
  r.setSize(400, 300);
});

function makeRenderState(overrides: Partial<TimeseriesRenderState> = {}): TimeseriesRenderState {
  return {
    color: ["#4e79a7", "#4e79a7", "#4e79a7"],
    alpha: 0.7,
    pointSize: 3,
    selected: new Uint8Array(1),
    paint: new Uint8Array(3),
    shadow: new Uint8Array(1),
    paintPalette: ["#000", "#e15759"],
    display: "points+lines",
    ySeriesIndex: 0,
    ...overrides,
  };
}

describe("TimeseriesRenderer", () => {
  it("computes data bounds from x and y values", () => {
    r.setData(
      new Float64Array([1, 2, 3]),
      new Float64Array([10, 20, 30]),
      new Uint8Array(1),
      new Uint8Array(1),
    );
    const bounds = r.getDataBounds();
    expect(bounds.xMin).toBeLessThan(1);
    expect(bounds.xMax).toBeGreaterThan(3);
    expect(bounds.yMin).toBeLessThan(10);
    expect(bounds.yMax).toBeGreaterThan(30);
  });

  it("getViewBounds returns data bounds when no viewport set", () => {
    r.setData(
      new Float64Array([0, 10]),
      new Float64Array([0, 100]),
      new Uint8Array(1),
      new Uint8Array(1),
    );
    const vb = r.getViewBounds();
    const db = r.getDataBounds();
    expect(vb.xMin).toBe(db.xMin);
    expect(vb.yMax).toBe(db.yMax);
  });

  it("getViewBounds returns viewport when set", () => {
    r.setData(
      new Float64Array([0, 10]),
      new Float64Array([0, 100]),
      new Uint8Array(1),
      new Uint8Array(1),
    );
    r.setViewport({ xMin: 0, xMax: 10, yMin: 0, yMax: 100 });
    const vb = r.getViewBounds();
    expect(vb.xMin).toBe(0);
    expect(vb.xMax).toBe(10);
    expect(vb.yMin).toBe(0);
    expect(vb.yMax).toBe(100);
  });

  it("transform maps data to pixel coordinates and back", () => {
    r.setData(
      new Float64Array([0, 10]),
      new Float64Array([0, 100]),
      new Uint8Array(1),
      new Uint8Array(1),
    );
    r.setViewport({ xMin: 0, xMax: 10, yMin: 0, yMax: 100 });
    const t = r.transform();
    const px = t.toPx(5, 50);
    const back = t.toData(px.x, px.y);
    expect(back.x).toBeCloseTo(5, 1);
    expect(back.y).toBeCloseTo(50, 1);
  });

  it("draw does not throw with any display mode", () => {
    r.setData(
      new Float64Array([1, 2, 3]),
      new Float64Array([10, 20, 30]),
      new Uint8Array(1),
      new Uint8Array(1),
    );
    expect(() => r.draw(makeRenderState({ display: "points+lines" }))).not.toThrow();
    expect(() => r.draw(makeRenderState({ display: "lines" }))).not.toThrow();
    expect(() => r.draw(makeRenderState({ display: "points" }))).not.toThrow();
  });

  it("detach clears canvas without error", () => {
    r.setData(
      new Float64Array([1, 2]),
      new Float64Array([10, 20]),
      new Uint8Array(1),
      new Uint8Array(1),
    );
    r.draw(makeRenderState());
    expect(() => r.detach()).not.toThrow();
  });

  it("draw with edge overlay does not throw", () => {
    r.setData(
      new Float64Array([1, 2, 3]),
      new Float64Array([10, 20, 30]),
      new Uint8Array(1),
      new Uint8Array(1),
    );
    const edgeOverlay: TimeseriesEdgeOverlay = {
      edges: { source: new Int32Array([0, 1]), target: new Int32Array([1, 2]), directed: false },
      color: "#c7c7d8",
      alpha: 0.3,
    };
    expect(() => r.draw(makeRenderState(), edgeOverlay)).not.toThrow();
  });

  it("draw with null edge overlay behaves like no overlay", () => {
    r.setData(
      new Float64Array([1, 2]),
      new Float64Array([10, 20]),
      new Uint8Array(1),
      new Uint8Array(1),
    );
    expect(() => r.draw(makeRenderState(), null)).not.toThrow();
  });

  it("draw skips edge overlay with zero alpha", () => {
    r.setData(
      new Float64Array([1, 2]),
      new Float64Array([10, 20]),
      new Uint8Array(1),
      new Uint8Array(1),
    );
    const edgeOverlay: TimeseriesEdgeOverlay = {
      edges: { source: new Int32Array([0]), target: new Int32Array([1]), directed: false },
      color: "#c7c7d8",
      alpha: 0,
    };
    expect(() => r.draw(makeRenderState(), edgeOverlay)).not.toThrow();
  });

  it("draw with per-edge colors does not throw", () => {
    r.setData(
      new Float64Array([1, 2, 3]),
      new Float64Array([10, 20, 30]),
      new Uint8Array(1),
      new Uint8Array(1),
    );
    const edgeOverlay: TimeseriesEdgeOverlay = {
      edges: { source: new Int32Array([0, 1]), target: new Int32Array([1, 2]), directed: false },
      color: "#c7c7d8",
      alpha: 0.3,
      perEdgeColors: ["#f00", "#0f0"],
    };
    expect(() => r.draw(makeRenderState(), edgeOverlay)).not.toThrow();
  });

  it("draw with large dataset triggers downsampling without error", () => {
    const n = 50000;
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) { x[i] = i; y[i] = Math.sin(i * 0.001); }
    r.setData(x, y, new Uint8Array(Math.ceil(n / 8)), new Uint8Array(Math.ceil(n / 8)));
    expect(() => r.draw(makeRenderState({ display: "lines" }))).not.toThrow();
    expect(() => r.draw(makeRenderState({ display: "points+lines" }))).not.toThrow();
    expect(() => r.draw(makeRenderState({ display: "points" }))).not.toThrow();
  });
});
