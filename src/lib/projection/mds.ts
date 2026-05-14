import type { ProjectionResult } from "./types";
import { permutationImportance } from "./permutation";

const EPS = 1e-10;

export function mdsProject(
  data: Float64Array,
  n: number,
  p: number,
  nComponents: number,
): ProjectionResult {
  const k = Math.min(nComponents, p, n - 1);
  if (n < 2) throw new Error("MDS requires at least 2 rows");

  const embedding = mdsEmbed(data, n, p, k);

  const dist = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let d2 = 0;
      for (let c = 0; c < p; c++) {
        const diff = data[i * p + c]! - data[j * p + c]!;
        d2 += diff * diff;
      }
      dist[i * n + j] = Math.sqrt(d2);
      dist[j * n + i] = dist[i * n + j]!;
    }
  }

  let stress = 0;
  let sumDist = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let embedD = 0;
      for (let c = 0; c < k; c++) {
        const diff = embedding[i * k + c]! - embedding[j * k + c]!;
        embedD += diff * diff;
      }
      const origD = dist[i * n + j]!;
      const diff = Math.sqrt(embedD) - origD;
      stress += diff * diff;
      sumDist += origD * origD;
    }
  }
  const normalizedStress = sumDist > EPS ? Math.sqrt(stress / sumDist) : 0;

  const varImportance = permutationImportance(
    data, n, p, k,
    mdsEmbed,
    3,
  );

  return { embedding, nComponents: k, explainedVar: null, stress: normalizedStress, loadings: null, varImportance };
}

function mdsEmbed(data: Float64Array, n: number, p: number, k: number): Float64Array {
  const d2 = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let dist2 = 0;
      for (let c = 0; c < p; c++) {
        const diff = data[i * p + c]! - data[j * p + c]!;
        dist2 += diff * diff;
      }
      d2[i * n + j] = dist2;
      d2[j * n + i] = dist2;
    }
  }

  const rowMeans = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += d2[i * n + j]!;
    rowMeans[i] = s / n;
  }
  let grandMean = 0;
  for (let i = 0; i < n; i++) grandMean += rowMeans[i]!;
  grandMean /= n;

  const B = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      B[i * n + j] = -0.5 * (d2[i * n + j]! - rowMeans[i]! - rowMeans[j]! + grandMean);
    }
  }

  const { values: eigenvalues, vectors } = jacobiEigen(B, n);

  const embedding = new Float64Array(n * k);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < k; c++) {
      embedding[i * k + c] = vectors[i * n + c]! * Math.sqrt(Math.max(0, eigenvalues[c]!));
    }
  }
  return embedding;
}

function jacobiEigen(input: Float64Array, n: number): { values: Float64Array; vectors: Float64Array } {
  const a = new Float64Array(input);
  const v = new Float64Array(n * n);
  for (let i = 0; i < n; i++) v[i * n + i] = 1;

  for (let iter = 0; iter < 100 * n * n; iter++) {
    let pi = 0;
    let qi = 1;
    let maxOff = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const val = Math.abs(a[i * n + j]!);
        if (val > maxOff) {
          maxOff = val;
          pi = i;
          qi = j;
        }
      }
    }
    if (maxOff < EPS) break;

    const app = a[pi * n + pi]!;
    const aqq = a[qi * n + qi]!;
    const apq = a[pi * n + qi]!;
    const tau = (aqq - app) / (2 * apq);
    const t = Math.sign(tau || 1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;

    for (let k = 0; k < n; k++) {
      if (k === pi || k === qi) continue;
      const akp = a[k * n + pi]!;
      const akq = a[k * n + qi]!;
      a[k * n + pi] = c * akp - s * akq;
      a[pi * n + k] = a[k * n + pi]!;
      a[k * n + qi] = s * akp + c * akq;
      a[qi * n + k] = a[k * n + qi]!;
    }
    a[pi * n + pi] = c * c * app - 2 * s * c * apq + s * s * aqq;
    a[qi * n + qi] = s * s * app + 2 * s * c * apq + c * c * aqq;
    a[pi * n + qi] = 0;
    a[qi * n + pi] = 0;

    for (let k = 0; k < n; k++) {
      const vkp = v[k * n + pi]!;
      const vkq = v[k * n + qi]!;
      v[k * n + pi] = c * vkp - s * vkq;
      v[k * n + qi] = s * vkp + c * vkq;
    }
  }

  const order = Array.from({ length: n }, (_, i) => i)
    .sort((aIdx, bIdx) => Math.abs(a[bIdx * n + bIdx]!) - Math.abs(a[aIdx * n + aIdx]!));
  const values = new Float64Array(n);
  const vectors = new Float64Array(n * n);
  for (let k = 0; k < n; k++) {
    const src = order[k]!;
    values[k] = a[src * n + src]!;
    for (let row = 0; row < n; row++) vectors[row * n + k] = v[row * n + src]!;
  }
  return { values, vectors };
}
