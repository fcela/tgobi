import { describe, it, expect } from "vitest";
import { logisticRegressionClassify } from "../logistic";

describe("logisticRegressionClassify", () => {
  it("classifies two well-separated groups", () => {
    const trainX: number[][] = [];
    const trainY: number[] = [];
    for (let i = 0; i < 20; i++) {
      trainX.push([0 + Math.random() * 0.5, 0 + Math.random() * 0.5]);
      trainY.push(0);
    }
    for (let i = 0; i < 20; i++) {
      trainX.push([10 + Math.random() * 0.5, 10 + Math.random() * 0.5]);
      trainY.push(1);
    }
    const predictX = [[0.25, 0.25], [10.25, 10.25]];
    const r = logisticRegressionClassify(trainX, trainY, predictX, 0.01, 500);
    expect(r.predictions[0]).toBe(0);
    expect(r.predictions[1]).toBe(1);
    expect(r.nClasses).toBe(2);
  });

  it("returns feature importance", () => {
    const trainX = [[0, 0], [0.1, 0], [10, 10], [10.1, 10]];
    const trainY = [0, 0, 1, 1];
    const r = logisticRegressionClassify(trainX, trainY, trainX, 0.01, 100);
    expect(r.featureImportance).toBeDefined();
    expect(r.featureImportance!.length).toBe(2);
  });

  it("returns correct sizes", () => {
    const trainX = [[0, 0], [0.1, 0.1], [10, 10], [10.1, 10.1]];
    const trainY = [0, 0, 1, 1];
    const predictX = [[0.05, 0.05], [10.05, 10.05]];
    const r = logisticRegressionClassify(trainX, trainY, predictX, 0.01, 200);
    expect(r.predictions.length).toBe(2);
    expect(r.sizes.reduce((a, b) => a + b, 0)).toBe(2);
  });
});
