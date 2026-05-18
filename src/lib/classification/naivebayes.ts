import type { ClassificationResult } from "./types";

const SQRT_2PI = Math.sqrt(2 * Math.PI);
const MIN_STD = 1e-9;

/**
 * Gaussian Naive Bayes implemented directly so we can return calibrated
 * per-class probabilities (via log-space softmax). The previous wrapper
 * around `ml-naivebayes` could not expose the posterior — its `predict`
 * compares unnormalized exponentials, which underflow on many features.
 */
export function naiveBayesClassify(
  trainX: number[][],
  trainY: number[],
  predictX: number[][],
): ClassificationResult {
  const nClasses = new Set(trainY).size;
  const n = trainX.length;
  const p = trainX[0]!.length;

  const counts = new Array<number>(nClasses).fill(0);
  const sumX = Array.from({ length: nClasses }, () => new Float64Array(p));
  const sumXX = Array.from({ length: nClasses }, () => new Float64Array(p));

  for (let i = 0; i < n; i++) {
    const c = trainY[i]!;
    if (c < 0 || c >= nClasses) continue;
    counts[c]!++;
    const row = trainX[i]!;
    for (let j = 0; j < p; j++) {
      const v = row[j]!;
      sumX[c]![j]! += v;
      sumXX[c]![j]! += v * v;
    }
  }

  const logPrior = new Array<number>(nClasses).fill(-Infinity);
  const mean = Array.from({ length: nClasses }, () => new Float64Array(p));
  const std = Array.from({ length: nClasses }, () => new Float64Array(p));

  for (let c = 0; c < nClasses; c++) {
    const k = counts[c]!;
    if (k === 0) continue;
    logPrior[c] = Math.log(k / n);
    for (let j = 0; j < p; j++) {
      const m = sumX[c]![j]! / k;
      const variance = Math.max(sumXX[c]![j]! / k - m * m, MIN_STD * MIN_STD);
      mean[c]![j] = m;
      std[c]![j] = Math.sqrt(variance);
    }
  }

  const predictions = new Int16Array(predictX.length);
  const probabilities = new Float32Array(predictX.length * nClasses);
  const logPost = new Float64Array(nClasses);

  for (let i = 0; i < predictX.length; i++) {
    const x = predictX[i]!;
    let maxLog = -Infinity;
    for (let c = 0; c < nClasses; c++) {
      let lp = logPrior[c]!;
      if (Number.isFinite(lp)) {
        for (let j = 0; j < p; j++) {
          const s = std[c]![j]!;
          const d = x[j]! - mean[c]![j]!;
          // log N(x | μ, σ²) = -log(σ √(2π)) - (x-μ)² / (2σ²)
          lp += -Math.log(s * SQRT_2PI) - (d * d) / (2 * s * s);
        }
      }
      logPost[c] = lp;
      if (lp > maxLog) maxLog = lp;
    }

    // softmax in log-space
    let sumExp = 0;
    for (let c = 0; c < nClasses; c++) sumExp += Math.exp(logPost[c]! - maxLog);
    let bestC = 0;
    let bestP = -1;
    for (let c = 0; c < nClasses; c++) {
      const pr = Math.exp(logPost[c]! - maxLog) / sumExp;
      probabilities[i * nClasses + c] = pr;
      if (pr > bestP) {
        bestP = pr;
        bestC = c;
      }
    }
    predictions[i] = bestC;
  }

  const sizes = new Array<number>(nClasses).fill(0);
  for (let i = 0; i < predictions.length; i++) {
    const c = predictions[i]!;
    if (c >= 0 && c < nClasses) sizes[c]!++;
  }
  return { predictions, nClasses, sizes, probabilities };
}
