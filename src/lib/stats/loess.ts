/**
 * LOESS (LOcally Estimated Scatterplot Smoothing).
 *
 * Cleveland, W. S. (1979). "Robust Locally Weighted Regression
 * and Smoothing Scatterplots". JASA 74(368), 829–836.
 *
 * Uses local linear fits with tricube kernel.
 * Robustness iterations re-weight outliers.
 */

export interface LoessResult {
  x: Float64Array;
  y: Float64Array;
}

const MAX_ROBUST_ITERS = 3;

function tricube(u: number): number {
  const abs = u < 0 ? -u : u;
  if (abs >= 1) return 0;
  const t = 1 - abs * abs * abs;
  return t * t * t;
}

function medianAbsDev(residuals: Float64Array, n: number): number {
  const abs = new Float64Array(n);
  for (let i = 0; i < n; i++) abs[i] = residuals[i]! < 0 ? -residuals[i]! : residuals[i]!;
  abs.sort();
  const mid = n >> 1;
  return n % 2 === 0 ? (abs[mid - 1]! + abs[mid]!) / 2 : abs[mid]!;
}

/**
 * Compute LOESS smooth.
 *
 * @param xData  predictor values (unsorted is fine)
 * @param yData  response values
 * @param missing  packed bit array: bit i set → row i excluded
 * @param shadow  packed bit array: bit i set → shadow row excluded from fit
 * @param span    fraction of data used in each local fit (0 < span ≤ 1, default 0.75)
 * @param nOut    number of output evaluation points (default 80)
 * @returns sorted {x, y} arrays for the smooth curve
 */
export function loess(
  xData: Float64Array,
  yData: Float64Array,
  missing: Uint8Array,
  shadow: Uint8Array,
  span = 0.75,
  nOut = 80,
): LoessResult | null {
  const n = xData.length;
  if (n < 4 || yData.length !== n) return null;

  // collect valid (non-missing, non-shadow) rows
  const validX: number[] = [];
  const validY: number[] = [];
  for (let i = 0; i < n; i++) {
    if (bitGet(missing, i) || bitGet(shadow, i)) continue;
    validX.push(xData[i]!);
    validY.push(yData[i]!);
  }
  const m = validX.length;
  if (m < 4) return null;

  // sort by x
  const order = new Array<number>(m);
  for (let i = 0; i < m; i++) order[i] = i;
  order.sort((a, b) => validX[a]! < validX[b]! ? -1 : validX[a]! > validX[b]! ? 1 : 0);
  const sx = new Float64Array(m);
  const sy = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    sx[j] = validX[order[j]!]!;
    sy[j] = validY[order[j]!]!;
  }

  const xMin = sx[0]!;
  const xMax = sx[m - 1]!;
  if (xMin === xMax) return null;

  const k = Math.max(2, Math.round(span * m));
  const outX = new Float64Array(nOut);
  const outY = new Float64Array(nOut);
  for (let j = 0; j < nOut; j++) {
    outX[j] = xMin + (xMax - xMin) * j / (nOut - 1);
  }

  const robustW = new Float64Array(m).fill(1);

  for (let iter = 0; iter <= MAX_ROBUST_ITERS; iter++) {
    for (let j = 0; j < nOut; j++) {
      outY[j] = localLinearFit(sx, sy, outX[j]!, k, robustW);
    }
    if (iter < MAX_ROBUST_ITERS) {
      const residuals = new Float64Array(m);
      for (let i = 0; i < m; i++) {
        const yHat = evalSmooth(sx, outX, outY, sx[i]!);
        residuals[i] = sy[i]! - yHat;
      }
      const mad = medianAbsDev(residuals, m);
      const b = 6 * Math.max(mad, 1e-12);
      for (let i = 0; i < m; i++) {
        const u = residuals[i]! / b;
        robustW[i] = u < -1 || u > 1 ? 0 : (1 - u * u) * (1 - u * u);
      }
    }
  }

  return { x: outX, y: outY };
}

function localLinearFit(
  sx: Float64Array,
  sy: Float64Array,
  x0: number,
  k: number,
  robustW: Float64Array,
): number {
  const m = sx.length;

  // find k nearest neighbors using binary search for left bound
  let lo = 0;
  let hi = m - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sx[mid]! < x0) lo = mid + 1; else hi = mid;
  }
  // lo is first index where sx[lo] >= x0
  let left = lo - k;
  let right = lo + k;
  if (left < 0) { left = 0; right = Math.min(m, k); }
  if (right > m) { right = m; left = Math.max(0, m - k); }

  // distance to farthest neighbor in window
  let maxDist = 0;
  for (let i = left; i < right; i++) {
    const d = Math.abs(sx[i]! - x0);
    if (d > maxDist) maxDist = d;
  }
  if (maxDist === 0) maxDist = 1;

  let s0 = 0, s1 = 0, s2 = 0, sY = 0, sXY = 0;
  for (let i = left; i < right; i++) {
    const u = (sx[i]! - x0) / maxDist;
    const w = tricube(u) * robustW[i]!;
    const dx = sx[i]! - x0;
    s0 += w;
    s1 += w * dx;
    s2 += w * dx * dx;
    sY += w * sy[i]!;
    sXY += w * dx * sy[i]!;
  }
  const det = s0 * s2 - s1 * s1;
  if (Math.abs(det) < 1e-12) {
    // fallback to weighted mean
    return s0 > 0 ? sY / s0 : sy[lo < m ? lo : m - 1]!;
  }
  return (s2 * sY - s1 * sXY) / det;
}

function evalSmooth(
  sx: Float64Array,
  outX: Float64Array,
  outY: Float64Array,
  x: number,
): number {
  const nOut = outX.length;
  if (x <= outX[0]!) return outY[0]!;
  if (x >= outX[nOut - 1]!) return outY[nOut - 1]!;
  // binary search
  let lo = 0, hi = nOut - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (outX[mid]! <= x) lo = mid; else hi = mid;
  }
  const t = (x - outX[lo]!) / (outX[hi]! - outX[lo]!);
  return outY[lo]! + t * (outY[hi]! - outY[lo]!);
}

function bitGet(buf: Uint8Array, i: number): boolean {
  return (buf[i >> 3]! >>> (i & 7) & 1) === 1;
}
