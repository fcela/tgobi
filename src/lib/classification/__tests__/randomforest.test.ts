import { describe, it, expect } from "vitest";
import { randomForestClassify } from "../randomforest";

describe("randomForestClassify", () => {
  it("classifies two well-separated groups", () => {
    const trainX: number[][] = [];
    const trainY: number[] = [];
    for (let i = 0; i < 20; i++) { trainX.push([0 + Math.random() * 0.1, 0 + Math.random() * 0.1]); trainY.push(0); }
    for (let i = 0; i < 20; i++) { trainX.push([10 + Math.random() * 0.1, 10 + Math.random() * 0.1]); trainY.push(1); }
    const predictX = [[0.05, 0.05], [10.05, 10.05]];
    const r = randomForestClassify(trainX, trainY, predictX, 10, 5);
    expect(r.predictions[0]).toBe(0);
    expect(r.predictions[1]).toBe(1);
    expect(r.nClasses).toBe(2);
  });

  it("respects nEstimators and maxDepth params", () => {
    const trainX = [[0, 0], [1, 1], [10, 10], [11, 11]];
    const trainY = [0, 0, 1, 1];
    const predictX = [[0.5, 0.5]];
    const r = randomForestClassify(trainX, trainY, predictX, 5, 3);
    expect(r.predictions.length).toBe(1);
    expect(r.nClasses).toBe(2);
  });
});
