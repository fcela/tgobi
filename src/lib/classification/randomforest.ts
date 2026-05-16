import { RandomForestClassifier } from "ml-random-forest";
import type { ClassificationResult } from "./types";

export function randomForestClassify(
  trainX: number[][],
  trainY: number[],
  predictX: number[][],
  nEstimators: number,
  maxDepth: number,
): ClassificationResult {
  const nClasses = new Set(trainY).size;
  const model = new RandomForestClassifier({ nEstimators, maxDepth, seed: 42 });
  model.train(trainX, trainY);
  const raw = model.predict(predictX);
  const predictions = new Int16Array(raw.length);
  for (let i = 0; i < raw.length; i++) predictions[i] = raw[i]!;

  const allProbs = new Float32Array(predictX.length);
  try {
    const probResults = (model as any).predictProbabilities ? (model as any).predictProbabilities(predictX) : null;
    if (probResults) {
      for (let i = 0; i < predictX.length; i++) {
        const c = predictions[i]!;
        const row = Array.isArray(probResults[i]) ? probResults[i] : probResults;
        allProbs[i] = c >= 0 && c < row.length ? Math.max(row[c] ?? 0, 0) : 0;
      }
    } else {
      for (let i = 0; i < predictX.length; i++) allProbs[i] = 1;
    }
  } catch {
    for (let i = 0; i < predictX.length; i++) allProbs[i] = 1;
  }

  const sizes = new Array<number>(nClasses).fill(0);
  for (let i = 0; i < predictions.length; i++) {
    const c = predictions[i]!;
    if (c >= 0 && c < nClasses) sizes[c]!++;
  }
  let featureImportance: number[] | undefined;
  try {
    featureImportance = (model as any).featureImportance() as number[];
  } catch { /* not available */ }
  return { predictions, nClasses, sizes, ...(featureImportance ? { featureImportance } : {}), probabilities: allProbs };
}
