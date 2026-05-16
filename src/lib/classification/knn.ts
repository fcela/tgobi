import KNN from "ml-knn";
import type { ClassificationResult } from "./types";

export function knnClassify(
  trainX: number[][],
  trainY: number[],
  predictX: number[][],
  k: number,
): ClassificationResult {
  const nClasses = new Set(trainY).size;
  const model = new KNN(trainX, trainY, { k });
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
  return { predictions, nClasses, sizes, probabilities: allProbs };
}
