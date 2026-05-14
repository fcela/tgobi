import type { ProjectionResult } from "./types";
import { permutationImportance } from "./permutation";

const EPS = 1e-12;

export function umapProject(
  data: Float64Array,
  n: number,
  p: number,
  nComponents: number,
  nNeighbors: number,
  minDist: number,
): ProjectionResult {
  const k = Math.min(nComponents, p, n - 1);
  if (n < 4) throw new Error("UMAP requires at least 4 rows");

  const Y = umapEmbed(data, n, p, k, nNeighbors, minDist, 200);

  const varImportance = permutationImportance(
    data, n, p, k,
    (d, n2, p2, k2) => umapEmbed(d, n2, p2, k2, nNeighbors, minDist, 50),
    3,
  );

  return { embedding: Y, nComponents: k, explainedVar: null, stress: null, loadings: null, varImportance };
}

export function umapEmbed(
  data: Float64Array,
  n: number,
  p: number,
  k: number,
  nNeighbors: number,
  minDist: number,
  epochs: number,
): Float64Array {
  const effectiveNN = Math.min(nNeighbors, n - 1);

  const knnDist = new Float64Array(n * effectiveNN);
  const knnIdx = new Int32Array(n * effectiveNN);
  for (let i = 0; i < n; i++) {
    const dists: { d: number; j: number }[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      let d2 = 0;
      for (let c = 0; c < p; c++) {
        const diff = data[i * p + c]! - data[j * p + c]!;
        d2 += diff * diff;
      }
      dists.push({ d: Math.sqrt(d2), j });
    }
    dists.sort((a, b) => a.d - b.d);
    for (let nn = 0; nn < effectiveNN; nn++) {
      knnDist[i * effectiveNN + nn] = dists[nn]?.d ?? 0;
      knnIdx[i * effectiveNN + nn] = dists[nn]?.j ?? 0;
    }
  }

  const rho = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    rho[i] = knnDist[i * effectiveNN]!;
  }

  const sigmas = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    sigmas[i] = smoothKnnDist(knnDist, n, i, effectiveNN);
  }

  const graphVal = new Float64Array(n * effectiveNN);
  for (let i = 0; i < n; i++) {
    for (let nn = 0; nn < effectiveNN; nn++) {
      const d = knnDist[i * effectiveNN + nn]!;
      const sigma = sigmas[i]!;
      if (sigma < EPS) { graphVal[i * effectiveNN + nn] = 0; continue; }
      const expDist = Math.exp(-(d - rho[i]!) / sigma);
      graphVal[i * effectiveNN + nn] = Math.min(expDist, 1);
    }
  }

  const graph = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let nn = 0; nn < effectiveNN; nn++) {
      const j = knnIdx[i * effectiveNN + nn]!;
      const v = graphVal[i * effectiveNN + nn]!;
      graph[i * n + j] = graph[i * n + j]! + v;
      graph[j * n + i] = graph[j * n + i]! + v;
    }
  }
  for (let i = 0; i < n * n; i++) graph[i] = Math.min(graph[i]!, 1);

  const Y = new Float64Array(n * k);
  for (let i = 0; i < n * k; i++) {
    Y[i] = (Math.random() - 0.5) * 0.01;
  }

  const ab = findAB(minDist);
  const a = ab.a;
  const b = ab.b;

  const lr = 1;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const alpha = lr * (1 - epoch / epochs);
    const grad = new Float64Array(n * k);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const w = graph[i * n + j]!;
        if (w < EPS) continue;

        let d2 = 0;
        for (let c = 0; c < k; c++) {
          const diff = Y[i * k + c]! - Y[j * k + c]!;
          d2 += diff * diff;
        }
        const d = Math.sqrt(d2 + EPS);

        let q: number;
        if (d2 <= EPS) {
          q = 1;
        } else {
          q = 1 / (1 + a * Math.pow(d2, b));
        }

        const force = w * (1 - q) + (1 - w) * q;
        for (let c = 0; c < k; c++) {
          const diff = Y[i * k + c]! - Y[j * k + c]!;
          grad[i * k + c]! += force * diff / (d + EPS);
        }
      }
    }

    let maxGrad = 0;
    for (let i = 0; i < n * k; i++) maxGrad = Math.max(maxGrad, Math.abs(grad[i]!));
    if (maxGrad > 4) {
      const clip = 4 / maxGrad;
      for (let i = 0; i < n * k; i++) grad[i]! *= clip;
    }

    for (let i = 0; i < n * k; i++) {
      Y[i] = Y[i]! + alpha * grad[i]!;
    }

    let meanY = new Float64Array(k);
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < k; c++) meanY[c]! += Y[i * k + c]!;
    }
    for (let c = 0; c < k; c++) meanY[c]! /= n;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < k; c++) Y[i * k + c]! -= meanY[c]!;
    }
  }

  return Y;
}

function smoothKnnDist(knnDist: Float64Array, _n: number, i: number, effectiveNN: number): number {
  const target = Math.log(effectiveNN);
  let lo = 0;
  let hi = Infinity;
  let mid = 1;

  for (let iter = 0; iter < 64; iter++) {
    mid = (lo + hi) / 2;
    if (mid === 0) break;
    let sum = 0;
    for (let nn = 0; nn < effectiveNN; nn++) {
      const d = knnDist[i * effectiveNN + nn]!;
      sum += Math.exp(-(d - knnDist[i * effectiveNN]!) / mid);
    }
    const h = Math.log(sum + EPS);
    if (Math.abs(h - target) < 1e-5) break;
    if (h < target) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return mid;
}

function findAB(minDist: number): { a: number; b: number } {
  let bestA = 1;
  let bestB = 1;
  let bestErr = Infinity;

  for (let aTry = 0.5; aTry <= 5; aTry += 0.1) {
    for (let bTry = 0.5; bTry <= 2; bTry += 0.1) {
      let err = 0;
      for (let d = 0; d <= 3; d += 0.1) {
        const target = d <= minDist ? 1 : Math.exp(-(d - minDist));
        const approx = 1 / (1 + aTry * Math.pow(d, bTry));
        err += (target - approx) ** 2;
      }
      if (err < bestErr) {
        bestErr = err;
        bestA = aTry;
        bestB = bTry;
      }
    }
  }
  return { a: bestA, b: bestB };
}
