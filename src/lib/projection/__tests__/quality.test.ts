import { describe, it, expect } from "vitest";
import { computeDRQuality } from "@/lib/projection/quality";

function makeIdentity(n: number, p: number): Float64Array {
  const data = new Float64Array(n * p);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      data[i * p + j] = i === j ? 1 : 0;
    }
  }
  return data;
}

function makeClustered(n: number, p: number): Float64Array {
  const data = new Float64Array(n * p);
  const half = Math.floor(n / 2);
  for (let i = 0; i < n; i++) {
    const center = i < half ? 0 : 10;
    for (let j = 0; j < p; j++) {
      data[i * p + j] = center + (Math.random() - 0.5) * 0.5;
    }
  }
  return data;
}

describe("computeDRQuality", () => {
  it("returns perfect trustworthiness and continuity for identity embedding", () => {
    const n = 20;
    const p = 5;
    const data = makeClustered(n, p);
    const result = computeDRQuality(data, data, n, p, p, 5);
    expect(result.trustworthiness).toBeCloseTo(1, 10);
    expect(result.continuity).toBeCloseTo(1, 10);
  });

  it("returns high trustworthiness for PCA on well-clustered data", () => {
    const n = 60;
    const p = 5;
    const data = makeClustered(n, p);
    const emb = new Float64Array(n * 2);
    for (let i = 0; i < n; i++) {
      emb[i * 2] = data[i * p]!;
      emb[i * 2 + 1] = data[i * p + 1]!;
    }
    const result = computeDRQuality(data, emb, n, p, 2, 5);
    expect(result.trustworthiness).toBeGreaterThan(0.7);
    expect(result.continuity).toBeGreaterThan(0.7);
  });

  it("returns lower trustworthiness for random embedding than for true data", () => {
    const n = 40;
    const p = 5;
    const data = makeClustered(n, p);
    const trueEmb = new Float64Array(n * 2);
    for (let i = 0; i < n; i++) {
      trueEmb[i * 2] = data[i * p]!;
      trueEmb[i * 2 + 1] = data[i * p + 1]!;
    }
    const randomEmb = new Float64Array(n * 2);
    for (let i = 0; i < n * 2; i++) {
      randomEmb[i] = Math.random() * 10;
    }
    const trueResult = computeDRQuality(data, trueEmb, n, p, 2, 5);
    const randomResult = computeDRQuality(data, randomEmb, n, p, 2, 5);
    expect(trueResult.trustworthiness).toBeGreaterThan(randomResult.trustworthiness);
  });

  it("returns Shepard diagram data with correct lengths", () => {
    const n = 15;
    const p = 3;
    const data = makeClustered(n, p);
    const emb = new Float64Array(n * 2);
    for (let i = 0; i < n; i++) {
      emb[i * 2] = data[i * p]!;
      emb[i * 2 + 1] = data[i * p + 1]!;
    }
    const result = computeDRQuality(data, emb, n, p, 2, 3);
    expect(result.shepardOrigDists.length).toBeGreaterThan(0);
    expect(result.shepardEmbDists.length).toEqual(result.shepardOrigDists.length);
    expect(result.shepardDeltas.length).toEqual(result.shepardOrigDists.length);
  });

  it("handles n=2 without crashing", () => {
    const data = new Float64Array([0, 0, 0, 1, 1, 1]);
    const emb = new Float64Array([0, 0, 1, 1]);
    const result = computeDRQuality(data, emb, 2, 3, 2, 1);
    expect(result.trustworthiness).toBeGreaterThanOrEqual(0);
    expect(result.trustworthiness).toBeLessThanOrEqual(1);
    expect(result.continuity).toBeGreaterThanOrEqual(0);
    expect(result.continuity).toBeLessThanOrEqual(1);
  });

  it("clamps k to n-2 to avoid degeneracy", () => {
    const n = 5;
    const p = 3;
    const data = makeClustered(n, p);
    const emb = new Float64Array(n * 2);
    for (let i = 0; i < n; i++) {
      emb[i * 2] = data[i * p]!;
      emb[i * 2 + 1] = data[i * p + 1]!;
    }
    const result = computeDRQuality(data, emb, n, p, 2, 100);
    expect(result.trustworthiness).toBeGreaterThanOrEqual(0);
    expect(result.trustworthiness).toBeLessThanOrEqual(1);
  });

  it("Shepard deltas equal orig - emb", () => {
    const n = 10;
    const p = 3;
    const data = makeClustered(n, p);
    const emb = new Float64Array(n * 2);
    for (let i = 0; i < n; i++) {
      emb[i * 2] = data[i * p]!;
      emb[i * 2 + 1] = data[i * p + 1]!;
    }
    const result = computeDRQuality(data, emb, n, p, 2, 3);
    for (let i = 0; i < result.shepardDeltas.length; i++) {
      const expected = result.shepardOrigDists[i]! - result.shepardEmbDists[i]!;
      expect(result.shepardDeltas[i]!).toBeCloseTo(expected, 10);
    }
  });
});
