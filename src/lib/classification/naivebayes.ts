import { GaussianNB } from "ml-naivebayes";
import type { ClassificationResult } from "./types";

export function naiveBayesClassify(
  trainX: number[][],
  trainY: number[],
  predictX: number[][],
): ClassificationResult {
  const nClasses = new Set(trainY).size;
  const model = new GaussianNB();
  model.train(trainX, trainY);
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
