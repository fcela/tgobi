import type { ClassificationMethod } from "./types";
import { knnClassify } from "./knn";
import { naiveBayesClassify } from "./naivebayes";
import { randomForestClassify } from "./randomforest";
import { logisticRegressionClassify } from "./logistic";

export interface CVResult {
  meanAccuracy: number;
  foldAccuracies: number[];
  nFolds: number;
}

export function crossValidate(
  X: number[][],
  y: number[],
  method: ClassificationMethod,
  nFolds: number,
  params: { knnK: number; rfNEstimators: number; rfMaxDepth: number; lrLambda: number; lrMaxIter: number },
): CVResult {
  const n = X.length;
  if (n < nFolds * 2) nFolds = Math.max(2, Math.floor(n / 2));

  const byClass = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const c = y[i]!;
    if (!byClass.has(c)) byClass.set(c, []);
    byClass.get(c)!.push(i);
  }

  const foldAssign = new Int16Array(n).fill(-1);
  let foldIdx = 0;
  for (const [, indices] of byClass) {
    for (let k = 0; k < indices.length; k++) {
      foldAssign[indices[k]!] = foldIdx % nFolds;
      foldIdx++;
    }
  }

  const foldAccuracies: number[] = [];

  for (let f = 0; f < nFolds; f++) {
    const testIdx: number[] = [];
    const trainIdx: number[] = [];
    for (let i = 0; i < n; i++) {
      if (foldAssign[i] === f) testIdx.push(i);
      else trainIdx.push(i);
    }

    if (trainIdx.length === 0 || testIdx.length === 0) continue;

    const trainX = trainIdx.map((i) => X[i]!);
    const trainY = trainIdx.map((i) => y[i]!);
    const testX = testIdx.map((i) => X[i]!);
    const testY = testIdx.map((i) => y[i]!);

    let result;
    switch (method) {
      case "knn":
        result = knnClassify(trainX, trainY, testX, params.knnK);
        break;
      case "naivebayes":
        result = naiveBayesClassify(trainX, trainY, testX);
        break;
      case "randomforest":
        result = randomForestClassify(trainX, trainY, testX, params.rfNEstimators, params.rfMaxDepth);
        break;
      case "logistic":
        result = logisticRegressionClassify(trainX, trainY, testX, params.lrLambda, params.lrMaxIter);
        break;
    }

    let correct = 0;
    for (let i = 0; i < testY.length; i++) {
      if (result.predictions[i] === testY[i]) correct++;
    }
    foldAccuracies.push(correct / testY.length);
  }

  const meanAccuracy = foldAccuracies.length > 0
    ? foldAccuracies.reduce((a, b) => a + b, 0) / foldAccuracies.length
    : 0;

  return { meanAccuracy, foldAccuracies, nFolds: foldAccuracies.length };
}
