import { describe, it, expect } from "vitest";
import { naiveBayesClassify } from "../naivebayes";

describe("naiveBayesClassify", () => {
  it("classifies two gaussian clusters", () => {
    const trainX: number[][] = [];
    const trainY: number[] = [];
    for (let i = 0; i < 20; i++) { trainX.push([0 + Math.random() * 0.1, 0 + Math.random() * 0.1]); trainY.push(0); }
    for (let i = 0; i < 20; i++) { trainX.push([10 + Math.random() * 0.1, 10 + Math.random() * 0.1]); trainY.push(1); }
    const predictX = [[0.05, 0.05], [10.05, 10.05]];
    const r = naiveBayesClassify(trainX, trainY, predictX);
    expect(r.predictions[0]).toBe(0);
    expect(r.predictions[1]).toBe(1);
    expect(r.nClasses).toBe(2);
  });

  it("returns correct array length", () => {
    const trainX = [[0, 0], [1, 1], [5, 5], [6, 6]];
    const trainY = [0, 0, 1, 1];
    const predictX = [[0.5, 0.5], [5.5, 5.5]];
    const r = naiveBayesClassify(trainX, trainY, predictX);
    expect(r.predictions.length).toBe(2);
  });

  it("returns per-class probabilities that sum to 1", () => {
    // Deterministic, equal-variance classes centered at 0 and 5.
    const trainX: number[][] = [];
    const trainY: number[] = [];
    for (let i = 0; i < 8; i++) {
      const t = (i - 3.5) * 0.1;
      trainX.push([0 + t, 0 + t]);
      trainY.push(0);
      trainX.push([5 + t, 5 + t]);
      trainY.push(1);
    }
    const predictX = [[0, 0], [2.5, 2.5], [5, 5]];
    const r = naiveBayesClassify(trainX, trainY, predictX);
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
    // Cluster centers — confident. Equidistant midpoint — exactly 50/50.
    expect(r.probabilities[0 * 2 + 0]!).toBeGreaterThan(0.99);
    expect(r.probabilities[2 * 2 + 1]!).toBeGreaterThan(0.99);
    expect(r.probabilities[1 * 2 + 0]!).toBeCloseTo(0.5, 5);
    expect(r.probabilities[1 * 2 + 1]!).toBeCloseTo(0.5, 5);
  });
});
