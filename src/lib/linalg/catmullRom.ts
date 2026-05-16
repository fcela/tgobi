import type { Mat } from "@/lib/linalg/types";
import { makeMat } from "@/lib/linalg/types";
import { gramSchmidt } from "@/lib/linalg/qr";
import { tourPath } from "@/lib/linalg/geodesic";

/**
 * Catmull-Rom geodesic spline interpolation on the Stiefel manifold.
 *
 * Given a sequence of orthonormal frames (keyframes) F_0, F_1, ..., F_{n-1},
 * produces a C¹-continuous path that passes through each keyframe using
 * Catmull-Rom blending of geodesic segments, re-orthonormalized via
 * Gram-Schmidt after each evaluation.
 *
 * Based on the approach in:
 *   Lekschas & Abdennur, "dtour: a steerable tour de vis through
 *   high-dimensional data," arXiv:2605.04306, 2026.
 */

const EPS = 1e-12;

export interface KeyframeSpline {
  /** Evaluate the spline at parameter u ∈ [0, 1]. */
  eval: (u: number) => Mat;
  /** Total arc length (sum of geodesic segment distances). */
  totalArcLength: number;
  /** Cumulative arc-length table for arc-length parameterization. */
  arcLengths: Float64Array;
  /** Number of keyframes. */
  numKeyframes: number;
  /** Number of rows (variables p). */
  nrow: number;
  /** Number of columns (projection dim k). */
  ncol: number;
}

export function buildKeyframeSpline(keyframes: Mat[]): KeyframeSpline {
  const n = keyframes.length;
  if (n < 2) throw new Error("buildKeyframeSpline: need at least 2 keyframes");
  const p = keyframes[0]!.nrow;
  const k = keyframes[0]!.ncol;

  for (let i = 1; i < n; i++) {
    if (keyframes[i]!.nrow !== p || keyframes[i]!.ncol !== k) {
      throw new Error("buildKeyframeSpline: keyframe dimension mismatch");
    }
  }

  const geodesicDistances: number[] = [];
  const segmentPaths: ((t: number) => Mat)[] = [];

  for (let i = 0; i < n - 1; i++) {
    const path = tourPath(keyframes[i]!, keyframes[i + 1]!);
    segmentPaths.push(path);
    geodesicDistances.push(geodesicDistance(keyframes[i]!, keyframes[i + 1]!, k));
  }

  const arcLengths = new Float64Array(n);
  arcLengths[0] = 0;
  for (let i = 0; i < n - 1; i++) {
    arcLengths[i + 1] = arcLengths[i]! + geodesicDistances[i]!;
  }
  const totalArcLength = arcLengths[n - 1]!;

  if (totalArcLength < EPS) {
    const constant = keyframes[0]!;
    return {
      eval: () => constant,
      totalArcLength: 0,
      arcLengths,
      numKeyframes: n,
      nrow: p,
      ncol: k,
    };
  }

  const evalFn = (u: number): Mat => {
    const uClamped = Math.max(0, Math.min(1, u));
    const s = uClamped * totalArcLength;
    const segIndex = findSegment(arcLengths, s);
    const segStart = arcLengths[segIndex]!;
    const segLen = geodesicDistances[segIndex]!;
    const localT = segLen > EPS ? (s - segStart) / segLen : 0;

    if (n === 2) {
      return segmentPaths[0]!(localT);
    }

    return catmullRomEval(
      keyframes, segmentPaths, segIndex, localT, p, k,
    );
  };

  return {
    eval: evalFn,
    totalArcLength,
    arcLengths,
    numKeyframes: n,
    nrow: p,
    ncol: k,
  };
}

function catmullRomEval(
  keyframes: Mat[],
  segmentPaths: ((t: number) => Mat)[],
  segIndex: number,
  t: number,
  p: number,
  k: number,
): Mat {
  const n = keyframes.length;
  const i = segIndex;

  const tangents: Mat[] = [];
  for (let j = 0; j < n; j++) {
    tangents.push(computeTangent(keyframes, segmentPaths, j, p, k));
  }

  const P0 = keyframes[i]!;
  const P1 = keyframes[i + 1]!;
  const m0 = tangents[i]!;
  const m1 = tangents[i + 1]!;

  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  const out = new Float64Array(p * k);
  for (let r = 0; r < p * k; r++) {
    out[r] = h00 * P0.values[r]!
           + h10 * m0.values[r]!
           + h01 * P1.values[r]!
           + h11 * m1.values[r]!;
  }

  return gramSchmidt(makeMat(p, k, out));
}

function computeTangent(
  keyframes: Mat[],
  segmentPaths: ((t: number) => Mat)[],
  j: number,
  p: number,
  k: number,
): Mat {
  const n = keyframes.length;

  if (n === 2) {
    const path = segmentPaths[0]!;
    const dt = 0.01;
    const F0 = path(0);
    const F1 = path(dt);
    const tangent = new Float64Array(p * k);
    for (let r = 0; r < p * k; r++) {
      tangent[r] = (F1.values[r]! - F0.values[r]!) / dt;
    }
    return makeMat(p, k, tangent);
  }

  if (j === 0) {
    const dt = 0.01;
    const F0 = segmentPaths[0]!(0);
    const F1 = segmentPaths[0]!(dt);
    const tangent = new Float64Array(p * k);
    for (let r = 0; r < p * k; r++) {
      tangent[r] = (F1.values[r]! - F0.values[r]!) / dt;
    }
    return makeMat(p, k, tangent);
  }

  if (j === n - 1) {
    const dt = 0.01;
    const lastSeg = segmentPaths[n - 2]!;
    const F0 = lastSeg(1 - dt);
    const F1 = lastSeg(1);
    const tangent = new Float64Array(p * k);
    for (let r = 0; r < p * k; r++) {
      tangent[r] = (F1.values[r]! - F0.values[r]!) / dt;
    }
    return makeMat(p, k, tangent);
  }

  const prev = segmentPaths[j - 1]!;
  const next = segmentPaths[j]!;
  const dt = 0.01;
  const Fprev = prev(1 - dt);
  const Fnext = next(dt);
  const tangent = new Float64Array(p * k);
  for (let r = 0; r < p * k; r++) {
    tangent[r] = (Fnext.values[r]! - Fprev.values[r]!) / (2 * dt);
  }
  return makeMat(p, k, tangent);
}

export function geodesicDistance(A: Mat, B: Mat, k?: number): number {
  const kk = k ?? A.ncol;
  const p = A.nrow;
  const M = new Float64Array(kk * kk);
  for (let i = 0; i < kk; i++) {
    for (let j = 0; j < kk; j++) {
      let s = 0;
      for (let r = 0; r < p; r++) {
        s += A.values[r * kk + i]! * B.values[r * kk + j]!;
      }
      M[i * kk + j] = s;
    }
  }

  const sv = singularValues(M, kk);
  let dist2 = 0;
  for (let i = 0; i < kk; i++) {
    const sigma = Math.max(-1, Math.min(1, sv[i]!));
    const theta = Math.acos(sigma);
    dist2 += theta * theta;
  }
  return Math.sqrt(dist2);
}

function singularValues(M: Float64Array, k: number): number[] {
  if (k === 1) {
    return [Math.abs(M[0]!)];
  }
  if (k === 2) {
    return svd2Values(M);
  }
  const MtM = new Float64Array(k * k);
  for (let i = 0; i < k; i++) {
    for (let j = i; j < k; j++) {
      let s = 0;
      for (let r = 0; r < k; r++) s += M[r * k + i]! * M[r * k + j]!;
      MtM[i * k + j] = s;
      if (i !== j) MtM[j * k + i] = s;
    }
  }
  return jacobiEigenvalues(MtM, k).map((v) => Math.sqrt(Math.max(0, v))).sort((a, b) => b - a);
}

function svd2Values(M: Float64Array): number[] {
  const a = M[0]!, b = M[1]!, c = M[2]!, d = M[3]!;
  const E = a * a + b * b + c * c + d * d;
  const F = a * a + b * b - c * c - d * d;
  const G = 2 * (a * c + b * d);
  const Q = Math.sqrt(F * F + G * G);
  return [Math.sqrt((E + Q) / 2), Math.sqrt(Math.max(0, (E - Q) / 2))];
}

function jacobiEigenvalues(A: Float64Array, k: number): number[] {
  const a = new Float64Array(A);
  const MAX_ITER = 100;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    let maxOff = 0;
    let pi = 0, qi = 1;
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        const v = Math.abs(a[i * k + j]!);
        if (v > maxOff) { maxOff = v; pi = i; qi = j; }
      }
    }
    if (maxOff < 1e-15) break;

    const app = a[pi * k + pi]!;
    const aqq = a[qi * k + qi]!;
    const apq = a[pi * k + qi]!;
    let c: number, s: number;
    if (Math.abs(app - aqq) < 1e-30) {
      c = Math.SQRT1_2;
      s = Math.SQRT1_2;
    } else {
      const tau = (aqq - app) / (2 * apq);
      const t = tau >= 0
        ? 1 / (tau + Math.sqrt(1 + tau * tau))
        : -1 / (-tau + Math.sqrt(1 + tau * tau));
      c = 1 / Math.sqrt(1 + t * t);
      s = t * c;
    }

    a[pi * k + pi] = c * c * app - 2 * s * c * apq + s * s * aqq;
    a[qi * k + qi] = s * s * app + 2 * s * c * apq + c * c * aqq;
    a[pi * k + qi] = 0;
    a[qi * k + pi] = 0;
    for (let r = 0; r < k; r++) {
      if (r === pi || r === qi) continue;
      const arp = a[r * k + pi]!;
      const arq = a[r * k + qi]!;
      a[r * k + pi] = c * arp - s * arq;
      a[pi * k + r] = a[r * k + pi]!;
      a[r * k + qi] = s * arp + c * arq;
      a[qi * k + r] = a[r * k + qi]!;
    }
  }
  return Array.from({ length: k }, (_, i) => a[i * k + i]!);
}

export function findSegment(arcLengths: Float64Array, s: number): number {
  let lo = 0, hi = arcLengths.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (arcLengths[mid]! <= s) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function arcLengthToU(spline: KeyframeSpline, s: number): number {
  if (spline.totalArcLength < EPS) return 0;
  return Math.max(0, Math.min(1, s / spline.totalArcLength));
}

export function uToArcLength(spline: KeyframeSpline, u: number): number {
  return u * spline.totalArcLength;
}
