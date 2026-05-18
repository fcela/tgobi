/**
 * Grid construction and boundary thinning for decision-surface visualization.
 *
 * Two modes:
 *  - 2D slice: vary the first two predictor axes on a `resolution × resolution`
 *    grid, hold the rest at their training-set medians. Boundary appears in
 *    one slice; cheap and always small.
 *  - Full p-D: vary every predictor axis on a `r × r × … × r` grid covering
 *    the full feature box. Boundary points show up in *any* tour projection,
 *    matching the classifly behavior. Total point count is capped: we pick
 *    the largest effective per-axis resolution r ≤ requested such that
 *    r^p ≤ MAX_GRID_POINTS.
 *
 * Both grids return per-point coords in two parallel forms:
 *  - `grid`: number[][] (one row per point, length p), convenient for passing
 *    to classifier predict() which expects an array-of-arrays.
 *  - `flat`: Float64Array of length total*p in row-major (point, axis) order;
 *    needed because the boundary store ultimately reads coords by axis index.
 */

export const MAX_GRID_POINTS = 200_000;

export interface GridResult {
  grid: number[][];
  flat: Float64Array;
  /** Per-axis resolution actually used (may be smaller than requested for p-D). */
  effectiveResolution: number;
  /** Number of axes the grid varies on (2 for "2d", p for "fullspace"). */
  gridDims: number;
}

export function buildGrid2D(
  mins: Float64Array,
  maxs: Float64Array,
  resolution: number,
  medians: Float64Array,
): GridResult {
  const p = mins.length;
  const total = resolution * resolution;
  const grid: number[][] = new Array(total);
  const flat = new Float64Array(total * p);

  const range0 = maxs[0]! - mins[0]!;
  const step0 = range0 === 0 || resolution <= 1 ? 0 : range0 / (resolution - 1);
  const range1 = p > 1 ? maxs[1]! - mins[1]! : 0;
  const step1 = range1 === 0 || resolution <= 1 ? 0 : range1 / (resolution - 1);

  for (let row = 0; row < resolution; row++) {
    for (let col = 0; col < resolution; col++) {
      const idx = row * resolution + col;
      const pt: number[] = new Array(p);
      for (let j = 0; j < p; j++) {
        if (j === 0) pt[j] = mins[0]! + col * step0;
        else if (j === 1) pt[j] = mins[1]! + row * step1;
        else pt[j] = medians[j]!;
        flat[idx * p + j] = pt[j]!;
      }
      grid[idx] = pt;
    }
  }
  return { grid, flat, effectiveResolution: resolution, gridDims: Math.min(2, p) };
}

/**
 * Pick the largest `r ≤ requested` such that `r^p ≤ cap`. Returns at least 2
 * (a grid with r=1 is just a point and has no neighbors to compare against).
 */
export function effectiveResolutionND(requested: number, p: number, cap = MAX_GRID_POINTS): number {
  let r = Math.max(2, requested | 0);
  while (r > 2 && Math.pow(r, p) > cap) r--;
  return r;
}

export function buildGridND(
  mins: Float64Array,
  maxs: Float64Array,
  resolution: number,
  cap = MAX_GRID_POINTS,
): GridResult {
  const p = mins.length;
  const r = effectiveResolutionND(resolution, p, cap);
  const total = Math.pow(r, p);
  const grid: number[][] = new Array(total);
  const flat = new Float64Array(total * p);

  const steps = new Float64Array(p);
  for (let j = 0; j < p; j++) {
    const range = maxs[j]! - mins[j]!;
    steps[j] = range === 0 || r <= 1 ? 0 : range / (r - 1);
  }

  for (let i = 0; i < total; i++) {
    const pt: number[] = new Array(p);
    let remainder = i;
    for (let j = 0; j < p; j++) {
      const digit = remainder % r;
      remainder = Math.floor(remainder / r);
      pt[j] = mins[j]! + digit * steps[j]!;
      flat[i * p + j] = pt[j]!;
    }
    grid[i] = pt;
  }
  return { grid, flat, effectiveResolution: r, gridDims: p };
}

/** 2D neighbor-disagreement: keep grid point if any axis-neighbor differs. */
export function thinToBoundary2D(predictions: Int16Array, resolution: number): Uint8Array {
  const total = resolution * resolution;
  const keep = new Uint8Array(total);
  for (let row = 0; row < resolution; row++) {
    for (let col = 0; col < resolution; col++) {
      const idx = row * resolution + col;
      const cls = predictions[idx]!;
      let isBoundary = false;
      if (col > 0 && predictions[idx - 1]! !== cls) isBoundary = true;
      else if (col < resolution - 1 && predictions[idx + 1]! !== cls) isBoundary = true;
      else if (row > 0 && predictions[(row - 1) * resolution + col]! !== cls) isBoundary = true;
      else if (row < resolution - 1 && predictions[(row + 1) * resolution + col]! !== cls) isBoundary = true;
      if (isBoundary) keep[idx] = 1;
    }
  }
  return keep;
}

/**
 * p-D neighbor-disagreement on a regular `r × r × … × r` grid laid out so
 * that axis 0 varies fastest. Keeps a point if any ±1 step along any axis
 * (within bounds) lands on a different predicted class.
 */
export function thinToBoundaryND(
  predictions: Int16Array,
  resolution: number,
  p: number,
): Uint8Array {
  const total = predictions.length;
  const keep = new Uint8Array(total);
  const r = resolution;

  // strides[j] = r^j — how far along the flat index one step on axis j moves.
  const strides = new Int32Array(p);
  let s = 1;
  for (let j = 0; j < p; j++) { strides[j] = s; s *= r; }

  for (let i = 0; i < total; i++) {
    const cls = predictions[i]!;
    let isBoundary = false;
    let remainder = i;
    for (let j = 0; j < p; j++) {
      const digit = remainder % r;
      remainder = (remainder - digit) / r;
      const stride = strides[j]!;
      if (digit > 0 && predictions[i - stride]! !== cls) { isBoundary = true; break; }
      if (digit < r - 1 && predictions[i + stride]! !== cls) { isBoundary = true; break; }
    }
    if (isBoundary) keep[i] = 1;
  }
  return keep;
}
