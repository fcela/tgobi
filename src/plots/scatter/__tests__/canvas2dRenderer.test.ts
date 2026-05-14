import { describe, it, expect, beforeEach } from "vitest";
import { Canvas2DScatterRenderer } from "@/plots/scatter/canvas2dRenderer";
import type { ScatterRenderState } from "@/plots/scatter/types";

let canvas: HTMLCanvasElement;
let r: Canvas2DScatterRenderer;

beforeEach(() => {
  canvas = document.createElement("canvas");
  canvas.width = 200; canvas.height = 200;
  r = new Canvas2DScatterRenderer();
  r.attach(canvas);
  r.setSize(200, 200);
});

const visual = (n: number): ScatterRenderState => ({
  color: Array(n).fill("#cccccc"),
  alpha: 0.65,
  pointSize: 2.5,
  selected: new Uint8Array(Math.ceil(n / 8)),
  paint: new Uint8Array(n),
  shape: new Uint8Array(n),
  shadow: new Uint8Array(Math.ceil(n / 8)),
  paintPalette: ["#000000", "#ff0000", "#00ff00"],
  showMarginals: false,
});

describe("Canvas2DScatterRenderer", () => {
  it("toPx maps data extremes to canvas extremes (with margin)", () => {
    r.setData(new Float64Array([0, 10]), new Float64Array([0, 100]),
              new Uint8Array(1), new Uint8Array(1));
    const t = r.transform();
    const p0 = t.toPx(0, 0);
    const p1 = t.toPx(10, 100);
    // Within the inner plotting area (margin > 0)
    expect(p0.x).toBeGreaterThan(0);
    expect(p1.x).toBeLessThan(200);
    expect(p0.y).toBeGreaterThan(p1.y); // y inverted (high data → low pixel)
  });

  it("toData round-trips with toPx", () => {
    r.setData(new Float64Array([0, 10]), new Float64Array([0, 100]),
              new Uint8Array(1), new Uint8Array(1));
    const t = r.transform();
    const px = t.toPx(5, 50);
    const back = t.toData(px.x, px.y);
    expect(back.x).toBeCloseTo(5, 6);
    expect(back.y).toBeCloseTo(50, 6);
  });

  it("uses an explicit viewport for transforms and can reset to data bounds", () => {
    r.setData(new Float64Array([0, 10]), new Float64Array([0, 100]),
              new Uint8Array(1), new Uint8Array(1));
    r.setViewport({ xMin: 0, xMax: 5, yMin: 0, yMax: 50 });

    const zoomed = r.transform();
    const p = zoomed.toPx(5, 50);
    expect(p.x).toBeCloseTo(172, 6);
    expect(p.y).toBeCloseTo(28, 6);
    const back = zoomed.toData(p.x, p.y);
    expect(back.x).toBeCloseTo(5, 6);
    expect(back.y).toBeCloseTo(50, 6);

    r.setViewport(null);
    expect(r.getViewBounds()).toEqual(r.getDataBounds());
  });

  it("draw() does not throw with empty selection / no active rect", () => {
    r.setData(new Float64Array([0, 5, 10]), new Float64Array([0, 50, 100]),
              new Uint8Array(1), new Uint8Array(1));
    expect(() => r.draw(visual(3), null)).not.toThrow();
  });

  it("draw() does not throw with an active rect", () => {
    r.setData(new Float64Array([0, 5, 10]), new Float64Array([0, 50, 100]),
              new Uint8Array(1), new Uint8Array(1));
    expect(() =>
      r.draw(visual(3), { tool: "rectangle", rect: { x0: 10, y0: 10, x1: 80, y1: 80 } }),
    ).not.toThrow();
  });

  it("constant column does not produce NaN", () => {
    r.setData(new Float64Array([5, 5, 5]), new Float64Array([5, 5, 5]),
              new Uint8Array(1), new Uint8Array(1));
    const t = r.transform();
    const p = t.toPx(5, 5);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  });
});
