import type { ClassificationResult } from "./types";

export function logisticRegressionClassify(
  trainX: number[][],
  trainY: number[],
  predictX: number[][],
  lambda: number,
  maxIter: number,
): ClassificationResult {
  const nClasses = new Set(trainY).size;
  const n = trainX.length;
  const p = trainX[0]!.length;

  const W: number[][] = Array.from({ length: nClasses }, () =>
    Array.from({ length: p }, () => (Math.random() - 0.5) * 0.01),
  );
  const b = new Array(nClasses).fill(0);

  const lr = 0.01;

  const xAvg = new Array(p).fill(0);
  for (let j = 0; j < p; j++) {
    for (let i = 0; i < n; i++) xAvg[j]! += trainX[i]![j]!;
    xAvg[j]! /= n;
  }
  const xStd = new Array(p).fill(0);
  for (let j = 0; j < p; j++) {
    for (let i = 0; i < n; i++) {
      const d = trainX[i]![j]! - xAvg[j]!;
      xStd[j]! += d * d;
    }
    xStd[j]! = Math.sqrt(xStd[j]! / n) || 1;
  }

  const sX = trainX.map((row) =>
    row.map((v, j) => (v - xAvg[j]!) / xStd[j]!),
  );

  function softmax(scores: number[]): number[] {
    let maxS = -Infinity;
    for (let c = 0; c < nClasses; c++) if (scores[c]! > maxS) maxS = scores[c]!;
    const exps = scores.map((s) => Math.exp(s - maxS));
    const sum = exps.reduce((a, b) => a + b, 0);
    return exps.map((e) => e / sum);
  }

  function computeScores(x: number[], w: number[][], bias: number[]): number[] {
    const scores: number[] = new Array(nClasses);
    for (let c = 0; c < nClasses; c++) {
      let s = bias[c]!;
      for (let j = 0; j < p; j++) s += w[c]![j]! * x[j]!;
      scores[c] = s;
    }
    return scores;
  }

  for (let iter = 0; iter < maxIter; iter++) {
    const gradW: number[][] = Array.from({ length: nClasses }, () => new Array(p).fill(0));
    const gradB = new Array(nClasses).fill(0);

    for (let i = 0; i < n; i++) {
      const scores = computeScores(sX[i]!, W, b);
      const probs = softmax(scores);
      const y = trainY[i]!;
      for (let c = 0; c < nClasses; c++) {
        const err = probs[c]! - (c === y ? 1 : 0);
        for (let j = 0; j < p; j++) {
          gradW[c]![j]! += err * sX[i]![j]!;
        }
        gradB[c]! += err;
      }
    }

    for (let c = 0; c < nClasses; c++) {
      for (let j = 0; j < p; j++) {
        W[c]![j]! -= lr * (gradW[c]![j]! / n + lambda * W[c]![j]!);
      }
      b[c]! -= lr * (gradB[c]! / n);
    }
  }

  const featureImportance: number[] = new Array(p).fill(0);
  for (let j = 0; j < p; j++) {
    let sumSq = 0;
    for (let c = 0; c < nClasses; c++) {
      const raw = W[c]![j]! / xStd[j]!;
      sumSq += raw * raw;
    }
    featureImportance[j]! = Math.sqrt(sumSq);
  }
  const maxImp = Math.max(...featureImportance, 0.001);
  for (let j = 0; j < p; j++) featureImportance[j]! /= maxImp;

  function predictProbs(x: number[]): { bestC: number; probs: Float64Array } {
    const sx = x.map((v, j) => (v - xAvg[j]!) / xStd[j]!);
    const scores = computeScores(sx, W, b);
    const probs = softmax(scores);
    let bestC = 0;
    let bestP = probs[0]!;
    for (let c = 1; c < nClasses; c++) {
      if (probs[c]! > bestP) {
        bestP = probs[c]!;
        bestC = c;
      }
    }
    return { bestC, probs: new Float64Array(probs) };
  }

  const allPredictions = new Int16Array(predictX.length);
  const allProbs = new Float32Array(predictX.length * nClasses);
  for (let i = 0; i < predictX.length; i++) {
    const { bestC, probs } = predictProbs(predictX[i]!);
    allPredictions[i] = bestC;
    for (let c = 0; c < nClasses; c++) allProbs[i * nClasses + c] = probs[c]!;
  }

  const sizes = new Array<number>(nClasses).fill(0);
  for (let i = 0; i < allPredictions.length; i++) {
    const c = allPredictions[i]!;
    if (c >= 0 && c < nClasses) sizes[c]!++;
  }

  return { predictions: allPredictions, nClasses, sizes, featureImportance, probabilities: allProbs };
}
