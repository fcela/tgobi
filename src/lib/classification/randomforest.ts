import { RandomForestClassifier } from "ml-random-forest";
import type { ClassificationResult } from "./types";

export function randomForestClassify(
  trainX: number[][],
  trainY: number[],
  predictX: number[][],
  nEstimators: number,
  maxDepth: number,
): ClassificationResult {
  const classLabels = Array.from(new Set(trainY)).sort((a, b) => a - b);
  const nClasses = classLabels.length;
  const model = new RandomForestClassifier({ nEstimators, maxDepth, seed: 42 });
  model.train(trainX, trainY);
  const raw = model.predict(predictX);
  const predictions = new Int16Array(raw.length);
  for (let i = 0; i < raw.length; i++) predictions[i] = raw[i]!;

  // ml-random-forest exposes predictProbability(toPredict, label) (singular),
  // returning per-row probability for that one label. Call once per class to
  // assemble the full distribution.
  const probabilities = new Float32Array(predictX.length * nClasses);
  const rfWithProb = model as unknown as { predictProbability: (x: number[][], label: number) => number[] };
  for (let c = 0; c < nClasses; c++) {
    const label = classLabels[c]!;
    const col = rfWithProb.predictProbability(predictX, label);
    for (let i = 0; i < predictX.length; i++) {
      probabilities[i * nClasses + c] = col[i] ?? 0;
    }
  }
  // Re-normalize defensively (predictProbability rounds to 6 decimals).
  for (let i = 0; i < predictX.length; i++) {
    const base = i * nClasses;
    let sum = 0;
    for (let c = 0; c < nClasses; c++) sum += probabilities[base + c]!;
    if (sum > 0) {
      const inv = 1 / sum;
      for (let c = 0; c < nClasses; c++) probabilities[base + c] = probabilities[base + c]! * inv;
    } else {
      probabilities[base + predictions[i]!] = 1;
    }
  }

  const sizes = new Array<number>(nClasses).fill(0);
  for (let i = 0; i < predictions.length; i++) {
    const c = predictions[i]!;
    if (c >= 0 && c < nClasses) sizes[c]!++;
  }
  let featureImportance: number[] | undefined;
  try {
    featureImportance = (model as unknown as { featureImportance: () => number[] }).featureImportance();
  } catch { /* not available */ }
  return { predictions, nClasses, sizes, ...(featureImportance ? { featureImportance } : {}), probabilities };
}
