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
  const sizes = new Array<number>(nClasses).fill(0);
  for (let i = 0; i < predictions.length; i++) {
    const c = predictions[i]!;
    if (c >= 0 && c < nClasses) sizes[c]!++;
  }
  return { predictions, nClasses, sizes };
}
