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

  it("returns per-class probabilities that sum to 1", () => {
    const trainX = [[0, 0], [0.1, 0.1], [10, 10], [10.1, 10.1]];
    const trainY = [0, 0, 1, 1];
    const predictX = [[0, 0], [5, 5], [10, 10]];
    const r = knnClassify(trainX, trainY, predictX, 4);
    expect(r.probabilities.length).toBe(predictX.length * r.nClasses);
    for (let i = 0; i < predictX.length; i++) {
      let s = 0;
      for (let c = 0; c < r.nClasses; c++) {
        const pr = r.probabilities[i * r.nClasses + c]!;
        expect(pr).toBeGreaterThanOrEqual(0);
        expect(pr).toBeLessThanOrEqual(1);
        s += pr;
      }
      expect(s).toBeCloseTo(1, 5);
    }
  });

  it("reflects neighbor mix: confident at cluster centers, uncertain between", () => {
    const trainX = [[0, 0], [0.1, 0.1], [10, 10], [10.1, 10.1]];
    const trainY = [0, 0, 1, 1];
    // At (0,0) k=2 neighbors are both class 0 → p(0)=1.
    // At (5.05, 5.05) the 2 nearest are (0.1,0.1) and (10,10) — one of
    // each class — so p(0)=p(1)=0.5.
    const r = knnClassify(trainX, trainY, [[0, 0], [5.05, 5.05]], 2);
    expect(r.probabilities[0 * 2 + 0]).toBeCloseTo(1, 5);
    expect(r.probabilities[0 * 2 + 1]).toBeCloseTo(0, 5);
    expect(r.probabilities[1 * 2 + 0]).toBeCloseTo(0.5, 5);
    expect(r.probabilities[1 * 2 + 1]).toBeCloseTo(0.5, 5);
  });
});
