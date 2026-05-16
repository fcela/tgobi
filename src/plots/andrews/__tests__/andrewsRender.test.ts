import { describe, it, expect } from "vitest";
import { computeAndrewsValues, computeLayout, identifyRow } from "../andrewsRender";

function makeCol(values: number[], missing: number[] = []) {
  const arr = new Float64Array(values);
  const buf = new Uint8Array(Math.ceil(values.length / 8));
  for (const i of missing) {
    const byte = i >> 3;
    const bit = i & 7;
    buf[byte]! |= 1 << bit;
  }
  return { values: arr, missing: buf };
}

describe("computeAndrewsValues", () => {
  it("computes Andrews curves for 2 variables", () => {
    const cols = [makeCol([1, 2]), makeCol([3, 4])];
    const res = 5;
    const { yAll, yMin, yMax, rowOffsets } = computeAndrewsValues(cols, res, 2);
    expect(rowOffsets[0]).toBe(0);
    expect(rowOffsets[1]).toBe(5);
    expect(yAll.length).toBe(10);
    expect(isFinite(yMin)).toBe(true);
    expect(isFinite(yMax)).toBe(true);
    expect(yMax).toBeGreaterThan(yMin);
  });

  it("handles missing values by producing NaN", () => {
    const cols = [makeCol([1, 2], [0]), makeCol([3, 4])];
    const res = 3;
    const { yAll } = computeAndrewsValues(cols, res, 2);
    expect(Number.isNaN(yAll[0])).toBe(true);
    expect(Number.isNaN(yAll[1])).toBe(true);
    expect(Number.isNaN(yAll[2])).toBe(true);
    expect(Number.isNaN(yAll[3])).toBe(false);
  });

  it("computes x1/sqrt(2) for the first variable", () => {
    const cols = [makeCol([Math.SQRT2]), makeCol([0])];
    const res = 3;
    const { yAll } = computeAndrewsValues(cols, res, 1);
    expect(yAll[0]).toBeCloseTo(1, 10);
    expect(yAll[1]).toBeCloseTo(1, 10);
    expect(yAll[2]).toBeCloseTo(1, 10);
  });

  it("computes x2*sin(t) for the second variable", () => {
    const cols = [makeCol([0]), makeCol([1])];
    const res = 3;
    const { yAll } = computeAndrewsValues(cols, res, 1);
    const t0 = -Math.PI;
    expect(yAll[0]).toBeCloseTo(Math.sin(t0), 10);
  });

  it("computes x3*cos(t) for the third variable", () => {
    const cols = [makeCol([0]), makeCol([0]), makeCol([2])];
    const res = 3;
    const { yAll } = computeAndrewsValues(cols, res, 1);
    expect(yAll[0]).toBeCloseTo(2 * Math.cos(-Math.PI), 10);
    expect(yAll[1]).toBeCloseTo(2 * Math.cos(0), 10);
    expect(yAll[2]).toBeCloseTo(2 * Math.cos(Math.PI), 10);
  });

  it("pads yMin/yMax when all values are the same", () => {
    const cols = [makeCol([0]), makeCol([0])];
    const res = 3;
    const { yMin, yMax } = computeAndrewsValues(cols, res, 1);
    expect(yMin).toBeCloseTo(-0.55, 10);
    expect(yMax).toBeCloseTo(0.55, 10);
  });

  it("returns default range with padding for all-NaN data", () => {
    const cols = [makeCol([1], [0])];
    const res = 3;
    const { yMin, yMax } = computeAndrewsValues(cols, res, 1);
    expect(yMin).toBeCloseTo(-1.1, 5);
    expect(yMax).toBeCloseTo(1.1, 5);
  });
});

describe("computeLayout", () => {
  it("computes layout from width, height, yMin, yMax", () => {
    const layout = computeLayout(400, 300, -2, 5);
    expect(layout.plotLeft).toBe(40);
    expect(layout.plotRight).toBe(382);
    expect(layout.plotTop).toBe(18);
    expect(layout.plotBot).toBe(264);
    expect(layout.plotW).toBe(342);
    expect(layout.plotH).toBe(246);
    expect(layout.yMin).toBe(-2);
    expect(layout.yMax).toBe(5);
  });
});

describe("identifyRow", () => {
  it("finds closest row to a point near a curve", () => {
    const cols = [makeCol([0, 10]), makeCol([0, 0])];
    const res = 50;
    const { yAll, yMin, yMax } = computeAndrewsValues(cols, res, 2);
    const layout = computeLayout(400, 300, yMin, yMax);

    const x = layout.plotLeft + layout.plotW * 0.5;
    const y = layout.plotBot - ((0 - layout.yMin) / (layout.yMax - layout.yMin)) * layout.plotH;

    const row = identifyRow(x, y, yAll, res, layout, 2);
    expect(row).toBe(0);
  });
});
