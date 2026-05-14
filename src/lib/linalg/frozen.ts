import type { Mat } from "@/lib/linalg/types";
import { makeMat } from "@/lib/linalg/types";

export function applyFrozenRowsPure(
  candidate: Mat,
  frozenRows: Uint8Array,
  frozenValues: Float64Array,
): Mat {
  const p = candidate.nrow;
  const k = candidate.ncol;
  if (k === 1) return applyFrozenRows1D(candidate, frozenRows, frozenValues, p);
  if (k === 2) return applyFrozenRows2D(candidate, frozenRows, frozenValues, p);
  return applyFrozenRows3D(candidate, frozenRows, frozenValues);
}

function applyFrozenRows1D(
  candidate: Mat,
  frozenRows: Uint8Array,
  frozenValues: Float64Array,
  p: number,
): Mat {
  const out = new Float64Array(candidate.values);
  let fixedNorm = 0;
  let movingNorm = 0;
  let movingCount = 0;

  for (let row = 0; row < p; row++) {
    if (frozenRows[row]) {
      const value = frozenValues[row]!;
      out[row] = value;
      fixedNorm += value * value;
    } else {
      const value = out[row]!;
      movingNorm += value * value;
      movingCount++;
    }
  }

  const remaining = Math.max(0, 1 - fixedNorm);
  if (movingCount === 0) return makeMat(p, 1, out);
  if (movingNorm < 1e-12) {
    let first = true;
    for (let row = 0; row < p; row++) {
      if (frozenRows[row]) continue;
      out[row] = first ? Math.sqrt(remaining) : 0;
      first = false;
    }
    return makeMat(p, 1, out);
  }

  const scale = Math.sqrt(remaining / movingNorm);
  for (let row = 0; row < p; row++) {
    if (!frozenRows[row]) out[row] = out[row]! * scale;
  }
  return makeMat(p, 1, out);
}

function applyFrozenRows2D(
  candidate: Mat,
  frozenRows: Uint8Array,
  frozenValues: Float64Array,
  p: number,
): Mat {
  const out = new Float64Array(candidate.values);
  const movingRows: number[] = [];
  let f00 = 0;
  let f01 = 0;
  let f11 = 0;

  for (let row = 0; row < p; row++) {
    if (frozenRows[row]) {
      const x = frozenValues[row * 2]!;
      const y = frozenValues[row * 2 + 1]!;
      out[row * 2] = x;
      out[row * 2 + 1] = y;
      f00 += x * x;
      f01 += x * y;
      f11 += y * y;
    } else {
      movingRows.push(row);
    }
  }

  if (movingRows.length === 0) return makeMat(p, 2, out);
  const q = orthonormalMovingPair(candidate, movingRows);
  const sqrtS = sqrtSym2(1 - f00, -f01, 1 - f11);

  for (let i = 0; i < movingRows.length; i++) {
    const row = movingRows[i]!;
    const q0 = q.q0[i]!;
    const q1 = q.q1[i]!;
    out[row * 2] = q0 * sqrtS[0] + q1 * sqrtS[2];
    out[row * 2 + 1] = q0 * sqrtS[1] + q1 * sqrtS[3];
  }

  return makeMat(p, 2, out);
}

export function applyFrozenRows3D(
  candidate: Mat,
  frozenRows: Uint8Array,
  frozenValues: Float64Array,
): Mat {
  const p = candidate.nrow;
  const out = new Float64Array(candidate.values);
  const movingRows: number[] = [];
  const fGram = new Float64Array(9);

  for (let row = 0; row < p; row++) {
    if (frozenRows[row]) {
      const x = frozenValues[row * 3]!;
      const y = frozenValues[row * 3 + 1]!;
      const z = frozenValues[row * 3 + 2]!;
      out[row * 3] = x;
      out[row * 3 + 1] = y;
      out[row * 3 + 2] = z;
      fGram[0]! += x * x;
      fGram[1]! += x * y;
      fGram[2]! += x * z;
      fGram[4]! += y * y;
      fGram[5]! += y * z;
      fGram[8]! += z * z;
    } else {
      movingRows.push(row);
    }
  }

  if (movingRows.length === 0) return makeMat(p, 3, out);
  const q = orthonormalMovingTriple(candidate, movingRows);
  const rem = new Float64Array(9);
  rem[0] = 1 - fGram[0]!; rem[1] = -fGram[1]!; rem[2] = -fGram[2]!;
  rem[3] = -fGram[1]!; rem[4] = 1 - fGram[4]!; rem[5] = -fGram[5]!;
  rem[6] = -fGram[2]!; rem[7] = -fGram[5]!; rem[8] = 1 - fGram[8]!;
  const sqrtS = sqrtSym3(rem);

  for (let i = 0; i < movingRows.length; i++) {
    const row = movingRows[i]!;
    const q0 = q.q0[i]!, q1 = q.q1[i]!, q2 = q.q2[i]!;
    out[row * 3] = q0 * sqrtS[0]! + q1 * sqrtS[3]! + q2 * sqrtS[6]!;
    out[row * 3 + 1] = q0 * sqrtS[1]! + q1 * sqrtS[4]! + q2 * sqrtS[7]!;
    out[row * 3 + 2] = q0 * sqrtS[2]! + q1 * sqrtS[5]! + q2 * sqrtS[8]!;
  }

  return makeMat(p, 3, out);
}

function orthonormalMovingTriple(candidate: Mat, rows: number[]): { q0: Float64Array; q1: Float64Array; q2: Float64Array } {
  const m = rows.length;
  const q0 = new Float64Array(m);
  const q1 = new Float64Array(m);
  const q2 = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    const row = rows[i]!;
    q0[i] = candidate.values[row * 3]!;
    q1[i] = candidate.values[row * 3 + 1]!;
    q2[i] = candidate.values[row * 3 + 2]!;
  }

  normalizeOrBasis(q0, 0);
  let dot = 0;
  for (let i = 0; i < m; i++) dot += q0[i]! * q1[i]!;
  for (let i = 0; i < m; i++) q1[i] = q1[i]! - dot * q0[i]!;
  normalizeOrBasis(q1, 1, q0);
  let d0 = 0, d1 = 0;
  for (let i = 0; i < m; i++) { d0 += q0[i]! * q2[i]!; d1 += q1[i]! * q2[i]!; }
  for (let i = 0; i < m; i++) q2[i] = q2[i]! - d0 * q0[i]! - d1 * q1[i]!;
  normalizeOrBasis(q2, 2, q0, q1);

  return { q0, q1, q2 };
}

function orthonormalMovingPair(candidate: Mat, rows: number[]): { q0: Float64Array; q1: Float64Array } {
  const q0 = new Float64Array(rows.length);
  const q1 = new Float64Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    q0[i] = candidate.values[row * 2]!;
    q1[i] = candidate.values[row * 2 + 1]!;
  }

  normalizeOrBasis(q0, 0);
  let dot = 0;
  for (let i = 0; i < rows.length; i++) dot += q0[i]! * q1[i]!;
  for (let i = 0; i < rows.length; i++) q1[i] = q1[i]! - dot * q0[i]!;
  normalizeOrBasis(q1, 1, q0);
  return { q0, q1 };
}

export function normalizeOrBasis(values: Float64Array, preferredIndex: number, ...against: Float64Array[]): void {
  let norm = vectorNorm(values);
  if (norm >= 1e-12) {
    for (let i = 0; i < values.length; i++) values[i] = values[i]! / norm;
    return;
  }

  values.fill(0);
  const start = Math.min(preferredIndex, Math.max(0, values.length - 1));
  for (let offset = 0; offset < values.length; offset++) {
    const idx = (start + offset) % values.length;
    values[idx] = 1;
    for (const a of against) {
      let dot = 0;
      for (let i = 0; i < values.length; i++) dot += values[i]! * a[i]!;
      for (let i = 0; i < values.length; i++) values[i] = values[i]! - dot * a[i]!;
    }
    norm = vectorNorm(values);
    if (norm >= 1e-12) {
      for (let i = 0; i < values.length; i++) values[i] = values[i]! / norm;
      return;
    }
    values.fill(0);
  }
}

function vectorNorm(values: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i]! * values[i]!;
  return Math.sqrt(sum);
}

function sqrtSym2(a: number, b: number, d: number): [number, number, number, number] {
  const trace = a + d;
  const radius = Math.hypot(a - d, 2 * b);
  const lambda1 = Math.max(0, (trace + radius) / 2);
  const lambda2 = Math.max(0, (trace - radius) / 2);
  const s1 = Math.sqrt(lambda1);
  const s2 = Math.sqrt(lambda2);
  const angle = 0.5 * Math.atan2(2 * b, a - d);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    s1 * c * c + s2 * s * s,
    (s1 - s2) * c * s,
    (s1 - s2) * c * s,
    s1 * s * s + s2 * c * c,
  ];
}

export function sqrtSym3(A: Float64Array): Float64Array {
  const { eigenvalues, eigenvectors } = jacobi3x3(A);
  const sqrtEigs = eigenvalues.map(e => Math.sqrt(Math.max(0, e)));
  const out = new Float64Array(9);
  for (let col = 0; col < 3; col++) {
    const se = sqrtEigs[col]!;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        out[i * 3 + j]! += eigenvectors[i * 3 + col]! * se * eigenvectors[j * 3 + col]!;
      }
    }
  }
  return out;
}

function jacobi3x3(A: Float64Array): { eigenvalues: number[]; eigenvectors: Float64Array } {
  const a = new Float64Array(A);
  const V = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const MAX_ITER = 50;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    let maxOff = 0;
    let p = 0, q = 1;
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        const v = Math.abs(a[i * 3 + j]!);
        if (v > maxOff) { maxOff = v; p = i; q = j; }
      }
    }
    if (maxOff < 1e-15) break;

    const app = a[p * 3 + p]!;
    const aqq = a[q * 3 + q]!;
    const apq = a[p * 3 + q]!;
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

    a[p * 3 + p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    a[q * 3 + q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    a[p * 3 + q] = 0;
    a[q * 3 + p] = 0;
    for (let r = 0; r < 3; r++) {
      if (r === p || r === q) continue;
      const arp = a[r * 3 + p]!;
      const arq = a[r * 3 + q]!;
      a[r * 3 + p] = c * arp - s * arq;
      a[p * 3 + r] = a[r * 3 + p]!;
      a[r * 3 + q] = s * arp + c * arq;
      a[q * 3 + r] = a[r * 3 + q]!;
    }

    for (let r = 0; r < 3; r++) {
      const vrp = V[r * 3 + p]!;
      const vrq = V[r * 3 + q]!;
      V[r * 3 + p] = c * vrp - s * vrq;
      V[r * 3 + q] = s * vrp + c * vrq;
    }
  }

  return {
    eigenvalues: [a[0]!, a[4]!, a[8]!],
    eigenvectors: V,
  };
}
