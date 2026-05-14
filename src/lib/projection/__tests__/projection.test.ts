import { describe, it, expect } from "vitest";
import { pcaProject } from "@/lib/projection/pca";
import { mdsProject } from "@/lib/projection/mds";
import { icaProject } from "@/lib/projection/ica";
import { tsneProject } from "@/lib/projection/tsne";
import { umapProject } from "@/lib/projection/umap";

describe("PCA", () => {
  it("projects identity-like data to 2 components", () => {
    const n = 20;
    const p = 3;
    const data = new Float64Array(n * p);
    for (let i = 0; i < n; i++) {
      data[i * p] = i;
      data[i * p + 1] = i * 2;
      data[i * p + 2] = i * 0.5;
    }
    const result = pcaProject(data, n, p, 2);
    expect(result.nComponents).toBe(2);
    expect(result.embedding.length).toBe(n * 2);
    expect(result.explainedVar).not.toBeNull();
    expect(result.explainedVar!.length).toBe(2);
    expect(result.explainedVar![0]).toBeGreaterThan(0);
    expect(result.stress).toBeNull();
  });

  it("captures most variance in first component", () => {
    const n = 50;
    const p = 3;
    const data = new Float64Array(n * p);
    for (let i = 0; i < n; i++) {
      data[i * p] = i * 10;
      data[i * p + 1] = Math.random() * 0.01;
      data[i * p + 2] = Math.random() * 0.01;
    }
    const result = pcaProject(data, n, p, 2);
    expect(result.explainedVar![0]).toBeGreaterThan(0.9);
  });

  it("handles nComponents > p gracefully", () => {
    const n = 10;
    const p = 2;
    const data = new Float64Array(n * p);
    for (let i = 0; i < n * p; i++) data[i] = i;
    const result = pcaProject(data, n, p, 5);
    expect(result.nComponents).toBeLessThanOrEqual(p);
  });
});

describe("MDS", () => {
  it("preserves relative distances", () => {
    const n = 10;
    const p = 3;
    const data = new Float64Array(n * p);
    for (let i = 0; i < n; i++) {
      data[i * p] = i;
      data[i * p + 1] = i * 2;
      data[i * p + 2] = i * 0.5;
    }
    const result = mdsProject(data, n, p, 2);
    expect(result.nComponents).toBe(2);
    expect(result.embedding.length).toBe(n * 2);
    expect(result.stress).not.toBeNull();
    expect(result.stress!).toBeLessThan(0.5);
  });

  it("requires at least 2 rows", () => {
    const data = new Float64Array(3);
    expect(() => mdsProject(data, 1, 3, 2)).toThrow("at least 2 rows");
  });
});

describe("ICA", () => {
  it("produces independent components for mixed signals", () => {
    const n = 200;
    const p = 2;
    const data = new Float64Array(n * p);
    for (let i = 0; i < n; i++) {
      const s1 = Math.sin(i * 0.1);
      const s2 = Math.sign(Math.sin(i * 0.05));
      data[i * p] = s1 + 0.5 * s2;
      data[i * p + 1] = 0.5 * s1 + s2;
    }
    const result = icaProject(data, n, p, 2);
    expect(result.nComponents).toBe(2);
    expect(result.embedding.length).toBe(n * 2);
  });

  it("requires more rows than variables", () => {
    const data = new Float64Array(4);
    expect(() => icaProject(data, 2, 3, 2)).toThrow("more rows than variables");
  });
});

describe("t-SNE", () => {
  it("produces 2D embedding", () => {
    const n = 20;
    const p = 3;
    const data = new Float64Array(n * p);
    for (let i = 0; i < n; i++) {
      data[i * p] = i;
      data[i * p + 1] = i * 2;
      data[i * p + 2] = i * 0.5;
    }
    const result = tsneProject(data, n, p, 2, 5, 100);
    expect(result.nComponents).toBe(2);
    expect(result.embedding.length).toBe(n * 2);
    expect(result.stress).toBeNull();
  });

  it("requires at least 3 rows", () => {
    const data = new Float64Array(4);
    expect(() => tsneProject(data, 2, 2, 2, 5, 100)).toThrow("at least 3 rows");
  });
});

describe("UMAP", () => {
  it("produces 2D embedding", () => {
    const n = 20;
    const p = 3;
    const data = new Float64Array(n * p);
    for (let i = 0; i < n; i++) {
      data[i * p] = i;
      data[i * p + 1] = i * 2;
      data[i * p + 2] = i * 0.5;
    }
    const result = umapProject(data, n, p, 2, 5, 0.1);
    expect(result.nComponents).toBe(2);
    expect(result.embedding.length).toBe(n * 2);
    expect(result.stress).toBeNull();
  });

  it("requires at least 4 rows", () => {
    const data = new Float64Array(6);
    expect(() => umapProject(data, 3, 2, 2, 5, 0.1)).toThrow("at least 4 rows");
  });
});
