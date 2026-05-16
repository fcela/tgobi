import { describe, it, expect } from "vitest";
import { crossValidate } from "../crossvalidation";

describe("crossValidate", () => {
  const makeData = (n: number, p: number) => {
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < n; i++) {
      const row: number[] = [];
      const cls = i < n / 2 ? 0 : 1;
      for (let j = 0; j < p; j++) {
        row.push(cls * 10 + Math.random() * 0.5);
      }
      X.push(row);
      y.push(cls);
    }
    return { X, y };
  };

  it("returns 5-fold CV for KNN", () => {
    const { X, y } = makeData(50, 2);
    const result = crossValidate(X, y, "knn", 5, {
      knnK: 3, rfNEstimators: 10, rfMaxDepth: 5, lrLambda: 0.01, lrMaxIter: 100,
    });
    expect(result.nFolds).toBe(5);
    expect(result.foldAccuracies.length).toBe(5);
    expect(result.meanAccuracy).toBeGreaterThan(0);
    expect(result.meanAccuracy).toBeLessThanOrEqual(1);
  });

  it("returns CV for logistic regression", () => {
    const { X, y } = makeData(30, 2);
    const result = crossValidate(X, y, "logistic", 5, {
      knnK: 3, rfNEstimators: 10, rfMaxDepth: 5, lrLambda: 0.01, lrMaxIter: 100,
    });
    expect(result.nFolds).toBeGreaterThanOrEqual(2);
    expect(result.meanAccuracy).toBeGreaterThan(0);
  });

  it("reduces folds for small datasets", () => {
    const X = [[0, 0], [10, 10]];
    const y = [0, 1];
    const result = crossValidate(X, y, "knn", 5, {
      knnK: 1, rfNEstimators: 10, rfMaxDepth: 5, lrLambda: 0.01, lrMaxIter: 100,
    });
    expect(result.nFolds).toBeLessThanOrEqual(2);
  });
});
