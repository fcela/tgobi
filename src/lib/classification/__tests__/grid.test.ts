import { describe, it, expect } from "vitest";
import {
  buildGrid2D,
  buildGridND,
  effectiveResolutionND,
  thinToBoundary2D,
  thinToBoundaryND,
  MAX_GRID_POINTS,
} from "../grid";

describe("buildGrid2D", () => {
  it("covers a r×r grid in the first two axes", () => {
    const mins = new Float64Array([0, 0]);
    const maxs = new Float64Array([1, 1]);
    const medians = new Float64Array([0, 0]);
    const { grid, flat, effectiveResolution, gridDims } = buildGrid2D(mins, maxs, 3, medians);
    expect(grid.length).toBe(9);
    expect(flat.length).toBe(9 * 2);
    expect(effectiveResolution).toBe(3);
    expect(gridDims).toBe(2);
    // corners
    expect(grid[0]).toEqual([0, 0]);
    expect(grid[2]).toEqual([1, 0]);
    expect(grid[6]).toEqual([0, 1]);
    expect(grid[8]).toEqual([1, 1]);
  });

  it("holds extra axes (>2) at their median", () => {
    const mins = new Float64Array([0, 0, -1]);
    const maxs = new Float64Array([1, 1, 9]);
    const medians = new Float64Array([0, 0, 4.2]);
    const { grid } = buildGrid2D(mins, maxs, 3, medians);
    for (const pt of grid) expect(pt[2]).toBe(4.2);
  });
});

describe("effectiveResolutionND", () => {
  it("returns the requested resolution when r^p fits the cap", () => {
    expect(effectiveResolutionND(5, 2, 1000)).toBe(5);
    expect(effectiveResolutionND(10, 3, 1000)).toBe(10);
  });

  it("lowers resolution until r^p ≤ cap", () => {
    // 10^4 = 10000 > 1000, drop to 5 (5^4 = 625)
    expect(effectiveResolutionND(10, 4, 1000)).toBe(5);
  });

  it("never returns below 2", () => {
    // 2^100 is astronomically larger than any cap, but we must not produce r=1
    expect(effectiveResolutionND(15, 100, 1000)).toBe(2);
  });

  it("uses MAX_GRID_POINTS by default", () => {
    // 15^5 ≈ 759k > 200k, so default cap drops resolution.
    expect(effectiveResolutionND(15, 5)).toBeLessThan(15);
    // sanity: result^5 should fit the cap
    const r = effectiveResolutionND(15, 5);
    expect(Math.pow(r, 5)).toBeLessThanOrEqual(MAX_GRID_POINTS);
  });
});

describe("buildGridND", () => {
  it("builds a regular r^p grid covering the full box", () => {
    const mins = new Float64Array([0, 10]);
    const maxs = new Float64Array([1, 12]);
    const { grid, flat, effectiveResolution, gridDims } = buildGridND(mins, maxs, 3, 1000);
    expect(effectiveResolution).toBe(3);
    expect(gridDims).toBe(2);
    expect(grid.length).toBe(9);
    expect(flat.length).toBe(18);
    // All 9 distinct combinations of {0, 0.5, 1} × {10, 11, 12} should appear.
    const expected = new Set<string>();
    for (const x of [0, 0.5, 1]) for (const y of [10, 11, 12]) expected.add(`${x},${y}`);
    const got = new Set<string>(grid.map((pt) => `${pt[0]},${pt[1]}`));
    expect(got).toEqual(expected);
  });

  it("automatically caps the total point count", () => {
    const p = 5;
    const mins = new Float64Array(p);
    const maxs = new Float64Array(p);
    for (let j = 0; j < p; j++) maxs[j] = 1;
    const { effectiveResolution, grid } = buildGridND(mins, maxs, 15, 200_000);
    expect(Math.pow(effectiveResolution, p)).toBeLessThanOrEqual(200_000);
    expect(grid.length).toBe(Math.pow(effectiveResolution, p));
  });
});

describe("thinToBoundary2D", () => {
  it("keeps only points whose 2D neighbors disagree", () => {
    // 3x3 grid, left half class 0, right half class 1.
    // Classes by row*r+col:
    //  0 0 1
    //  0 0 1
    //  0 0 1
    // Boundary is the middle column (col=1) — all 3 have a class-1 neighbor
    // to the right. The right column (col=2) also has a class-0 neighbor to
    // the left, so it's also part of the boundary.
    const preds = new Int16Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const keep = thinToBoundary2D(preds, 3);
    // Column 0 (idx 0,3,6) is pure-class-0 interior → not boundary.
    expect(keep[0]).toBe(0); expect(keep[3]).toBe(0); expect(keep[6]).toBe(0);
    // Column 1 (idx 1,4,7) sees class-1 next door → boundary.
    expect(keep[1]).toBe(1); expect(keep[4]).toBe(1); expect(keep[7]).toBe(1);
    // Column 2 (idx 2,5,8) sees class-0 next door → boundary.
    expect(keep[2]).toBe(1); expect(keep[5]).toBe(1); expect(keep[8]).toBe(1);
  });

  it("returns no boundary when all predictions are one class", () => {
    const preds = new Int16Array([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const keep = thinToBoundary2D(preds, 3);
    for (let i = 0; i < 9; i++) expect(keep[i]).toBe(0);
  });
});

describe("thinToBoundaryND", () => {
  it("finds boundaries along any axis on a 3-axis grid", () => {
    // 2×2×2 grid (r=2, p=3). Predictions split along axis 2:
    //   indices 0..3 → class 0  (low along axis 2)
    //   indices 4..7 → class 1  (high along axis 2)
    // Every point has a neighbor with the other class along axis 2, so all
    // 8 points should be kept as boundary.
    const preds = new Int16Array([0, 0, 0, 0, 1, 1, 1, 1]);
    const keep = thinToBoundaryND(preds, 2, 3);
    for (let i = 0; i < 8; i++) expect(keep[i]).toBe(1);
  });

  it("ignores axes where neighbors agree", () => {
    // 3-axis 3³ grid, all class 0 except one corner.
    // Only the corner and its three axis-neighbors should be kept.
    const r = 3, p = 3;
    const total = r ** p;
    const preds = new Int16Array(total);
    // index 0 is the (0,0,0) corner — flip it to class 1
    preds[0] = 1;
    const keep = thinToBoundaryND(preds, r, p);
    let kept = 0;
    for (let i = 0; i < total; i++) if (keep[i]) kept++;
    // index 0 (the flipped point) plus its three +1-axis neighbors at strides
    // 1, r, r² = (1, 3, 9). That's 4 boundary points.
    expect(kept).toBe(4);
    expect(keep[0]).toBe(1);
    expect(keep[1]).toBe(1);
    expect(keep[r]).toBe(1);
    expect(keep[r * r]).toBe(1);
  });
});
