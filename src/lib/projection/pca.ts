import type { ProjectionResult } from "./types";

const EPS = 1e-10;

export function pcaProject(
  data: Float64Array,
  n: number,
  p: number,
  nComponents: number,
): ProjectionResult {
  const k = Math.min(nComponents, p, n - 1);

  const means = new Float64Array(p);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      means[j]! += data[i * p + j]!;
    }
  }
  for (let j = 0; j < p; j++) means[j]! /= n;

  const cov = new Float64Array(p * p);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < p; a++) {
      const da = data[i * p + a]! - means[a]!;
      for (let b = a; b < p; b++) {
        cov[a * p + b]! += da * (data[i * p + b]! - means[b]!);
      }
    }
  }
  for (let a = 0; a < p; a++) {
    for (let b = a; b < p; b++) {
      cov[a * p + b]! /= n - 1;
      cov[b * p + a] = cov[a * p + b]!;
    }
  }

  const { values: eigenvalues, vectors } = jacobiEigen(cov, p);

  const totalVar = eigenvalues.reduce((s, v) => s + v, 0);
  const explainedVar = Array.from({ length: k }, (_, i) =>
    totalVar > EPS ? eigenvalues[i]! / totalVar : 0,
  );

  const embedding = new Float64Array(n * k);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < k; c++) {
      let val = 0;
      for (let j = 0; j < p; j++) {
        val += (data[i * p + j]! - means[j]!) * vectors[j * p + c]!;
      }
      embedding[i * k + c] = val;
    }
  }

  const loadings = new Float64Array(p * k);
  for (let v = 0; v < p; v++) {
    for (let c = 0; c < k; c++) {
      loadings[v * k + c] = vectors[v * p + c]!;
    }
  }

  const varImportance: number[] = [];
  let maxImp = 0;
  for (let v = 0; v < p; v++) {
    let imp = 0;
    for (let c = 0; c < k; c++) {
      const l = loadings[v * k + c]!;
      imp += l * l * (eigenvalues[c]! / (totalVar > EPS ? totalVar : 1));
    }
    varImportance.push(imp);
    if (imp > maxImp) maxImp = imp;
  }
  if (maxImp > 0) {
    for (let v = 0; v < p; v++) varImportance[v] = varImportance[v]! / maxImp;
  }

  return { embedding, nComponents: k, explainedVar, stress: null, loadings, varImportance };
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
    values[k] = Math.max(0, a[src * n + src]!);
    for (let row = 0; row < n; row++) vectors[row * n + k] = v[row * n + src]!;
  }
  return { values, vectors };
}
