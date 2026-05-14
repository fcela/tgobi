import type { ProjectionResult } from "./types";

export function icaProject(
  data: Float64Array,
  n: number,
  p: number,
  nComponents: number,
): ProjectionResult {
  const k = Math.min(nComponents, p);
  if (n < p + 1) throw new Error("ICA requires more rows than variables");

  const means = new Float64Array(p);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) means[j]! += data[i * p + j]!;
  }
  for (let j = 0; j < p; j++) means[j]! /= n;

  const centered = new Float64Array(n * p);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      centered[i * p + j] = data[i * p + j]! - means[j]!;
    }
  }

  const cov = new Float64Array(p * p);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < p; a++) {
      const da = centered[i * p + a]!;
      for (let b = a; b < p; b++) {
        cov[a * p + b]! += da * centered[i * p + b]!;
      }
    }
  }
  for (let a = 0; a < p; a++) {
    for (let b = a; b < p; b++) {
      cov[a * p + b]! /= n;
      cov[b * p + a] = cov[a * p + b]!;
    }
  }

  const { values: eigenvalues, vectors: evecs } = jacobiEigen(cov, p);

  const kActual = Math.min(k, p);
  const whitened = new Float64Array(n * kActual);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < kActual; c++) {
      let val = 0;
      for (let j = 0; j < p; j++) {
        val += centered[i * p + j]! * evecs[j * p + c]!;
      }
      const scale = eigenvalues[c]! > 1e-10 ? 1 / Math.sqrt(eigenvalues[c]!) : 0;
      whitened[i * kActual + c] = val * scale;
    }
  }

  const W = fastICA(whitened, n, kActual);

  const embedding = new Float64Array(n * kActual);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < kActual; c++) {
      let val = 0;
      for (let j = 0; j < kActual; j++) {
        val += whitened[i * kActual + j]! * W[c * kActual + j]!;
      }
      embedding[i * kActual + c] = val;
    }
  }

  const loadings = new Float64Array(p * kActual);
  for (let v = 0; v < p; v++) {
    for (let c = 0; c < kActual; c++) {
      let val = 0;
      for (let j = 0; j < kActual; j++) {
        const scale = eigenvalues[j]! > 1e-10 ? 1 / Math.sqrt(eigenvalues[j]!) : 0;
        val += evecs[v * p + j]! * scale * W[c * kActual + j]!;
      }
      loadings[v * kActual + c] = val;
    }
  }

  const varImportance: number[] = [];
  let maxImp = 0;
  for (let v = 0; v < p; v++) {
    let imp = 0;
    for (let c = 0; c < kActual; c++) {
      const l = loadings[v * kActual + c]!;
      imp += l * l;
    }
    varImportance.push(imp);
    if (imp > maxImp) maxImp = imp;
  }
  if (maxImp > 0) {
    for (let v = 0; v < p; v++) varImportance[v] = varImportance[v]! / maxImp;
  }

  return { embedding, nComponents: kActual, explainedVar: null, stress: null, loadings, varImportance };
}

function fastICA(Z: Float64Array, n: number, k: number): Float64Array {
  const W = new Float64Array(k * k);

  for (let c = 0; c < k; c++) {
    let w = new Float64Array(k);
    for (let j = 0; j < k; j++) w[j] = Math.random() - 0.5;
    normalize(w, k);

    for (let iter = 0; iter < 200; iter++) {
      const wNew = new Float64Array(k);

      for (let i = 0; i < n; i++) {
        let ws = 0;
        for (let j = 0; j < k; j++) ws += w[j]! * Z[i * k + j]!;
        const g = ws * ws * ws;
        const gPrime = 3 * ws * ws;
        for (let j = 0; j < k; j++) {
          wNew[j]! += Z[i * k + j]! * g;
        }
        for (let j = 0; j < k; j++) {
          wNew[j]! -= w[j]! * gPrime / n * n;
        }
      }

      for (let j = 0; j < k; j++) wNew[j]! /= n;

      for (let prev = 0; prev < c; prev++) {
        let dot = 0;
        for (let j = 0; j < k; j++) dot += wNew[j]! * W[prev * k + j]!;
        for (let j = 0; j < k; j++) wNew[j]! -= dot * W[prev * k + j]!;
      }

      normalize(wNew, k);

      let conv = 0;
      for (let j = 0; j < k; j++) conv += Math.abs(Math.abs(wNew[j]!) - Math.abs(w[j]!));
      w = wNew;

      if (conv < 1e-6) break;
    }

    for (let j = 0; j < k; j++) W[c * k + j] = w[j]!;
  }

  return W;
}

function normalize(w: Float64Array, k: number) {
  let norm = 0;
  for (let j = 0; j < k; j++) norm += w[j]! * w[j]!;
  norm = Math.sqrt(norm);
  if (norm > 1e-10) {
    for (let j = 0; j < k; j++) w[j]! /= norm;
  }
}

const EPS = 1e-10;

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
