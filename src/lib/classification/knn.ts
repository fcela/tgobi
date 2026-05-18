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

  // The kdTree stores each point as [x1, ..., xP, label] (ml-knn appends the
  // label to each row). nearest(point, k) returns [[point, dist], ...].
  const kdTree = (model as unknown as { kdTree: { nearest: (pt: number[], k: number) => [number[], number][] } }).kdTree;
  const labelIdx = trainX[0]!.length;

  const predictions = new Int16Array(predictX.length);
  const probabilities = new Float32Array(predictX.length * nClasses);
  const counts = new Int32Array(nClasses);
  const denom = 1 / k;

  for (let i = 0; i < predictX.length; i++) {
    const neighbors = kdTree.nearest(predictX[i]!, k);
    counts.fill(0);
    // Walk neighbors in distance order (kdTree.nearest returns them sorted)
    // and pick the class that *reaches* the new max count first — this
    // matches ml-knn's tiebreak: ties resolve in favor of the class whose
    // closest neighbor is closer.
    let bestC = -1;
    let bestN = 0;
    for (let j = 0; j < neighbors.length; j++) {
      const label = neighbors[j]![0][labelIdx]! | 0;
      if (label < 0 || label >= nClasses) continue;
      const c = ++counts[label]!;
      if (c > bestN) {
        bestN = c;
        bestC = label;
      }
    }
    for (let c = 0; c < nClasses; c++) {
      probabilities[i * nClasses + c] = counts[c]! * denom;
    }
    predictions[i] = bestC >= 0 ? bestC : 0;
  }

  const sizes = new Array<number>(nClasses).fill(0);
  for (let i = 0; i < predictions.length; i++) {
    const c = predictions[i]!;
    if (c >= 0 && c < nClasses) sizes[c]!++;
  }
  return { predictions, nClasses, sizes, probabilities };
}
