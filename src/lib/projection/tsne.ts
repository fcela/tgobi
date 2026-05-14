import type { ProjectionResult } from "./types";
import { permutationImportance } from "./permutation";

const EPS = 1e-12;

export function tsneProject(
  data: Float64Array,
  n: number,
  p: number,
  nComponents: number,
  perplexity: number,
  maxIter: number,
): ProjectionResult {
  const k = Math.min(nComponents, p, n - 1);
  if (n < 3) throw new Error("t-SNE requires at least 3 rows");

  const Y = tsneEmbed(data, n, p, k, perplexity, maxIter);

  const varImportance = permutationImportance(
    data, n, p, k,
    (d, n2, p2, k2) => tsneEmbed(d, n2, p2, k2, perplexity, Math.min(maxIter, 150)),
    3,
  );

  return { embedding: Y, nComponents: k, explainedVar: null, stress: null, loadings: null, varImportance };
}

export function tsneEmbed(
  data: Float64Array,
  n: number,
  p: number,
  k: number,
  perplexity: number,
  maxIter: number,
): Float64Array {
  const effectivePerplexity = Math.min(perplexity, n - 1);

  const dist = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let d2 = 0;
      for (let c = 0; c < p; c++) {
        const diff = data[i * p + c]! - data[j * p + c]!;
        d2 += diff * diff;
      }
      dist[i * n + j] = d2;
      dist[j * n + i] = d2;
    }
  }

  const P = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    const sigma = binarySearchSigma(dist, n, i, effectivePerplexity);
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      P[i * n + j] = Math.exp(-dist[i * n + j]! / (2 * sigma * sigma));
    }
    let sumP = 0;
    for (let j = 0; j < n; j++) sumP += P[i * n + j]!;
    if (sumP > EPS) {
      for (let j = 0; j < n; j++) P[i * n + j]! /= sumP;
    }
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sym = (P[i * n + j]! + P[j * n + i]!) / (2 * n);
      P[i * n + j] = Math.max(sym, EPS);
      P[j * n + i] = Math.max(sym, EPS);
    }
  }

  const earlyExag = 4;
  for (let i = 0; i < n * n; i++) P[i]! *= earlyExag;

  const Y = new Float64Array(n * k);
  const gains = new Float64Array(n * k);
  const yInc = new Float64Array(n * k);
  for (let i = 0; i < n * k; i++) {
    Y[i] = (Math.random() - 0.5) * 1e-3;
    gains[i] = 1;
  }

  const lr = 100;
  const momentum = 0.5;
  const finalMomentum = 0.8;
  const earlyStop = Math.floor(maxIter / 5);

  for (let iter = 0; iter < maxIter; iter++) {
    if (iter === earlyStop) {
      for (let i = 0; i < n * n; i++) P[i]! /= earlyExag;
    }
    const curMomentum = iter < 250 ? momentum : finalMomentum;

    const qDist = new Float64Array(n * n);
    let sumQ = EPS;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let d2 = 0;
        for (let c = 0; c < k; c++) {
          const diff = Y[i * k + c]! - Y[j * k + c]!;
          d2 += diff * diff;
        }
        const val = 1 / (1 + d2);
        qDist[i * n + j] = val;
        qDist[j * n + i] = val;
        sumQ += 2 * val;
      }
    }

    const grad = new Float64Array(n * k);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const mult = 4 * (P[i * n + j]! - qDist[i * n + j]! / sumQ) * qDist[i * n + j]!;
        for (let c = 0; c < k; c++) {
          grad[i * k + c]! += mult * (Y[i * k + c]! - Y[j * k + c]!);
        }
      }
    }

    for (let i = 0; i < n * k; i++) {
      const sign = grad[i]! > 0 ? 1 : -1;
      const gainSign = yInc[i]! > 0 ? 1 : -1;
      if (sign !== gainSign) {
        gains[i] = gains[i]! + 0.2;
      } else {
        gains[i] = gains[i]! * 0.8;
      }
      gains[i] = Math.max(gains[i]!, 0.01);
      yInc[i] = curMomentum * yInc[i]! - lr * gains[i]! * grad[i]!;
      Y[i] = Y[i]! + yInc[i]!;
    }

    if (iter > 0 && iter % 100 === 0) {
      let meanY = new Float64Array(k);
      for (let i = 0; i < n; i++) {
        for (let c = 0; c < k; c++) meanY[c]! += Y[i * k + c]!;
      }
      for (let c = 0; c < k; c++) meanY[c]! /= n;
      for (let i = 0; i < n; i++) {
        for (let c = 0; c < k; c++) Y[i * k + c]! -= meanY[c]!;
      }
    }
  }

  return Y;
}

function binarySearchSigma(
  dist: Float64Array,
  n: number,
  i: number,
  perplexity: number,
): number {
  const targetH = Math.log(perplexity);
  let lo = 1e-20;
  let hi = 1e4;
  let sigma = 1;

  for (let binIter = 0; binIter < 50; binIter++) {
    sigma = (lo + hi) / 2;
    let sumP = 0;
    let sumPlogP = 0;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const pij = Math.exp(-dist[i * n + j]! / (2 * sigma * sigma));
      sumP += pij;
      sumPlogP += pij * Math.log(pij + EPS);
    }
    if (sumP < EPS) { lo = sigma; continue; }
    const entropy = -sumPlogP / sumP + Math.log(sumP);
    const h = entropy;
    if (Math.abs(h - targetH) < 1e-5) break;
    if (h > targetH) {
      hi = sigma;
    } else {
      lo = sigma;
    }
  }
  return sigma;
}
