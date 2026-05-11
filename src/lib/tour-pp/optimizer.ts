import type { Mat } from "@/lib/linalg/types";
import { makeMat } from "@/lib/linalg/types";
import { gramSchmidt } from "@/lib/linalg/qr";
import { projectionPursuitValue } from "@/lib/tour-pp/indices";
import type { ProjectionPursuitIndex } from "@/lib/tour-pp/indices";

export interface ProjectionPursuitTarget {
  basis: Mat;
  value: number;
}

export interface ProjectionPursuitOptimizerOptions {
  steps?: number;
  initialStep?: number;
  minStep?: number;
  temperature?: number;
}

export function projectionPursuitTarget(
  X: Mat,
  current: Mat,
  index: ProjectionPursuitIndex,
  rng: () => number,
  options: ProjectionPursuitOptimizerOptions = {},
  classLabels?: Int32Array | null,
): ProjectionPursuitTarget {
  if (index === "lda" && classLabels) {
    const target = ldaTargetBasis(X, current, classLabels, rng);
    if (target) {
      return {
        basis: target,
        value: projectionPursuitValue(X, target, index, classLabels),
      };
    }
  }

  const steps = options.steps ?? 120;
  const initialStep = options.initialStep ?? 0.5;
  const minStep = options.minStep ?? 0.035;
  const temperature0 = options.temperature ?? 0.02;

  let state = current;
  let stateValue = projectionPursuitValue(X, state, index, classLabels);
  let best = state;
  let bestValue = stateValue;

  for (let i = 0; i < steps; i++) {
    const progress = i / Math.max(1, steps - 1);
    const step = minStep + (initialStep - minStep) * (1 - progress) * (1 - progress);
    const temperature = temperature0 * (1 - progress) + 1e-6;
    const candidate = perturbBasis(state, step, rng);
    if (!candidate) continue;

    const candidateValue = projectionPursuitValue(X, candidate, index, classLabels);
    const delta = candidateValue - stateValue;
    if (delta >= 0 || rng() < Math.exp(delta / temperature)) {
      state = candidate;
      stateValue = candidateValue;
    }
    if (candidateValue > bestValue) {
      best = candidate;
      bestValue = candidateValue;
    }
  }

  return { basis: best, value: bestValue };
}

function ldaTargetBasis(X: Mat, current: Mat, labels: Int32Array, rng: () => number): Mat | null {
  const n = X.nrow;
  const p = X.ncol;
  const k = current.ncol;
  if (labels.length !== n) return null;

  const classes = new Map<number, { count: number; sum: Float64Array; mean: Float64Array }>();
  let nValid = 0;
  const overall = new Float64Array(p);
  for (let i = 0; i < n; i++) {
    const label = labels[i]!;
    if (label < 0) continue;
    let cls = classes.get(label);
    if (!cls) {
      cls = { count: 0, sum: new Float64Array(p), mean: new Float64Array(p) };
      classes.set(label, cls);
    }
    cls.count++;
    nValid++;
    for (let j = 0; j < p; j++) {
      const x = X.values[i * p + j]!;
      cls.sum[j] = cls.sum[j]! + x;
      overall[j] = overall[j]! + x;
    }
  }
  if (classes.size < 2 || nValid < 2) return null;

  for (let j = 0; j < p; j++) overall[j] = overall[j]! / nValid;
  for (const cls of classes.values()) {
    for (let j = 0; j < p; j++) cls.mean[j] = cls.sum[j]! / cls.count;
  }

  const between = new Float64Array(p * p);
  for (const cls of classes.values()) {
    for (let a = 0; a < p; a++) {
      const da = cls.mean[a]! - overall[a]!;
      for (let b = 0; b < p; b++) {
        between[a * p + b] = between[a * p + b]! + cls.count * da * (cls.mean[b]! - overall[b]!);
      }
    }
  }

  const dirs: Float64Array[] = [];
  const first = largestMeanDifference(classes, p);
  if (first) dirs.push(first);
  for (let j = dirs.length; j < k; j++) {
    const v = new Float64Array(p);
    for (let i = 0; i < p; i++) v[i] = gaussian(rng);
    const dir = leadingEigenvector(between, p, dirs, v);
    if (dir) dirs.push(dir);
  }

  for (let j = 0; dirs.length < k && j < current.ncol; j++) {
    const v = new Float64Array(p);
    for (let i = 0; i < p; i++) v[i] = current.values[i * current.ncol + j]!;
    if (orthonormalize(v, dirs)) dirs.push(v);
  }

  while (dirs.length < k) {
    const v = new Float64Array(p);
    for (let i = 0; i < p; i++) v[i] = gaussian(rng);
    if (orthonormalize(v, dirs)) dirs.push(v);
    else break;
  }
  if (dirs.length < k) return null;

  const values = new Float64Array(p * k);
  for (let j = 0; j < k; j++) {
    const dir = dirs[j]!;
    for (let i = 0; i < p; i++) values[i * k + j] = dir[i]!;
  }
  try {
    return gramSchmidt(makeMat(p, k, values));
  } catch {
    return null;
  }
}

function leadingEigenvector(
  A: Float64Array,
  p: number,
  existing: Float64Array[],
  start: Float64Array,
): Float64Array | null {
  const v = new Float64Array(start);
  if (!orthonormalize(v, existing)) return null;
  const next = new Float64Array(p);
  for (let iter = 0; iter < 80; iter++) {
    next.fill(0);
    for (let i = 0; i < p; i++) {
      let sum = 0;
      for (let j = 0; j < p; j++) sum += A[i * p + j]! * v[j]!;
      next[i] = sum;
    }
    if (!orthonormalize(next, existing)) return null;
    v.set(next);
  }
  return v;
}

function largestMeanDifference(
  classes: Map<number, { count: number; sum: Float64Array; mean: Float64Array }>,
  p: number,
): Float64Array | null {
  const all = Array.from(classes.values());
  let best: Float64Array | null = null;
  let bestD2 = 0;
  for (let a = 0; a < all.length; a++) {
    for (let b = a + 1; b < all.length; b++) {
      const diff = new Float64Array(p);
      let d2 = 0;
      for (let j = 0; j < p; j++) {
        diff[j] = all[a]!.mean[j]! - all[b]!.mean[j]!;
        d2 += diff[j]! * diff[j]!;
      }
      if (d2 > bestD2) {
        best = diff;
        bestD2 = d2;
      }
    }
  }
  if (!best || bestD2 < 1e-12) return null;
  scaleInPlace(best, 1 / Math.sqrt(bestD2));
  return best;
}

function orthonormalize(v: Float64Array, existing: Float64Array[]): boolean {
  for (const u of existing) {
    const d = dot(v, u);
    for (let i = 0; i < v.length; i++) v[i] = v[i]! - d * u[i]!;
  }
  const n = Math.sqrt(dot(v, v));
  if (n < 1e-10) return false;
  scaleInPlace(v, 1 / n);
  return true;
}

function dot(a: Float64Array, b: Float64Array): number {
  let out = 0;
  for (let i = 0; i < a.length; i++) out += a[i]! * b[i]!;
  return out;
}

function scaleInPlace(v: Float64Array, s: number): void {
  for (let i = 0; i < v.length; i++) v[i] = v[i]! * s;
}

function perturbBasis(B: Mat, step: number, rng: () => number): Mat | null {
  const values = new Float64Array(B.values.length);
  for (let i = 0; i < B.values.length; i++) {
    values[i] = B.values[i]! + step * gaussian(rng);
  }
  try {
    return gramSchmidt(makeMat(B.nrow, B.ncol, values));
  } catch {
    return null;
  }
}

function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
