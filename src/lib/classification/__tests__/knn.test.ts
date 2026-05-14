import { describe, it, expect } from "vitest";
import { knnClassify } from "../knn";

describe("knnClassify", () => {
  it("classifies two well-separated groups", () => {
    const trainX = [[0, 0], [0.1, 0.1], [10, 10], [10.1, 10.1]];
    const trainY = [0, 0, 1, 1];
    const predictX = [[0.05, 0.05], [10.05, 10.05]];
    const r = knnClassify(trainX, trainY, predictX, 3);
    expect(r.predictions[0]).toBe(0);
    expect(r.predictions[1]).toBe(1);
    expect(r.nClasses).toBe(2);
  });

  it("returns correct sizes", () => {
    const trainX = [[0], [1], [10], [11]];
    const trainY = [0, 0, 1, 1];
    const predictX = [[0.5], [10.5], [0.2]];
    const r = knnClassify(trainX, trainY, predictX, 3);
    expect(r.predictions.length).toBe(3);
    expect(r.sizes.reduce((a, b) => a + b, 0)).toBe(3);
  });
});
