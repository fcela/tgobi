import { describe, it, expect } from "vitest";
import {
  computeScagnostics,
  computeAllPairs,
  SCAGNOSTIC_MEASURES,
  type ScagnosticScores,
} from "../index";

function makeMissing(n: number): Uint8Array {
  return new Uint8Array(Math.ceil(n / 8));
}

function linearData(n: number): { x: Float64Array; y: Float64Array; xm: Uint8Array; ym: Uint8Array } {
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = i;
    y[i] = 2 * i + 1;
  }
  return { x, y, xm: makeMissing(n), ym: makeMissing(n) };
}

function clusterData(n: number): { x: Float64Array; y: Float64Array; xm: Uint8Array; ym: Uint8Array } {
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const half = Math.floor(n / 2);
  for (let i = 0; i < half; i++) {
    x[i] = 0 + Math.random() * 0.5;
    y[i] = 0 + Math.random() * 0.5;
  }
  for (let i = half; i < n; i++) {
    x[i] = 5 + Math.random() * 0.5;
    y[i] = 5 + Math.random() * 0.5;
  }
  return { x, y, xm: makeMissing(n), ym: makeMissing(n) };
}

function circularData(n: number): { x: Float64Array; y: Float64Array; xm: Uint8Array; ym: Uint8Array } {
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n;
    x[i] = Math.cos(angle);
    y[i] = Math.sin(angle);
  }
  return { x, y, xm: makeMissing(n), ym: makeMissing(n) };
}

function randomCloud(n: number): { x: Float64Array; y: Float64Array; xm: Uint8Array; ym: Uint8Array } {
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = Math.random();
    y[i] = Math.random();
  }
  return { x, y, xm: makeMissing(n), ym: makeMissing(n) };
}

function allInRange(scores: ScagnosticScores): boolean {
  return Object.values(scores).every((v) => v >= 0 && v <= 1);
}

describe("computeScagnostics", () => {
  it("returns all zeros for fewer than 3 points", () => {
    const x = new Float64Array([1, 2]);
    const y = new Float64Array([3, 4]);
    const xm = makeMissing(2);
    const ym = makeMissing(2);
    const scores = computeScagnostics(x, y, xm, ym);
    for (const m of SCAGNOSTIC_MEASURES) {
      expect(scores[m]).toBe(0);
    }
  });

  it("returns all values in [0,1] for linear data", () => {
    const { x, y, xm, ym } = linearData(50);
    const scores = computeScagnostics(x, y, xm, ym);
    expect(allInRange(scores)).toBe(true);
  });

  it("detects high monotonicity for perfectly linear data", () => {
    const { x, y, xm, ym } = linearData(100);
    const scores = computeScagnostics(x, y, xm, ym);
    expect(scores.monotonic).toBeGreaterThan(0.9);
  });

  it("detects low monotonicity for circular data", () => {
    const { x, y, xm, ym } = circularData(100);
    const scores = computeScagnostics(x, y, xm, ym);
    expect(scores.monotonic).toBeLessThan(0.5);
  });

  it("returns values in [0,1] for cluster data", () => {
    const { x, y, xm, ym } = clusterData(100);
    const scores = computeScagnostics(x, y, xm, ym);
    expect(allInRange(scores)).toBe(true);
  });

  it("returns values in [0,1] for random cloud", () => {
    const { x, y, xm, ym } = randomCloud(200);
    const scores = computeScagnostics(x, y, xm, ym);
    expect(allInRange(scores)).toBe(true);
  });

  it("circular data has low skinny (round shape)", () => {
    const { x, y, xm, ym } = circularData(200);
    const scores = computeScagnostics(x, y, xm, ym);
    expect(scores.skinny).toBeLessThan(0.5);
  });

  it("handles missing values gracefully", () => {
    const n = 50;
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      x[i] = i;
      y[i] = i * 2;
    }
    const xm = makeMissing(n);
    const ym = makeMissing(n);
    // Mark some as missing
    xm[0] = 0x01; // row 0 missing in x
    ym[1] = 0x02; // row 1 missing in y
    const scores = computeScagnostics(x, y, xm, ym);
    expect(allInRange(scores)).toBe(true);
    expect(scores.monotonic).toBeGreaterThan(0.8);
  });

  it("handles NaN values gracefully", () => {
    const n = 30;
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      x[i] = i;
      y[i] = i * 3;
    }
    x[5] = NaN;
    y[10] = NaN;
    const xm = makeMissing(n);
    const ym = makeMissing(n);
    const scores = computeScagnostics(x, y, xm, ym);
    expect(allInRange(scores)).toBe(true);
  });

  it("two-cluster data has high clumpy", () => {
    // Two well-separated clusters: MST edge between clusters is long,
    // but the gap (min connecting Delaunay edge) is even longer → high clumpy
    const n = 100;
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    const half = n / 2;
    for (let i = 0; i < half; i++) {
      x[i] = Math.random() * 0.3;
      y[i] = Math.random() * 0.3;
    }
    for (let i = half; i < n; i++) {
      x[i] = 10 + Math.random() * 0.3;
      y[i] = 10 + Math.random() * 0.3;
    }
    const scores = computeScagnostics(x, y, makeMissing(n), makeMissing(n));
    expect(scores.clumpy).toBeGreaterThan(0.5);
  });

  it("stringy data (line) has high stringy score", () => {
    const n = 50;
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      x[i] = i;
      y[i] = i + Math.random() * 0.01;
    }
    const scores = computeScagnostics(x, y, makeMissing(n), makeMissing(n));
    expect(scores.stringy).toBeGreaterThan(0.5);
  });

  it("has exactly 9 measures", () => {
    expect(SCAGNOSTIC_MEASURES.length).toBe(9);
  });

  it("all measure names are keys of ScagnosticScores", () => {
    const { x, y, xm, ym } = linearData(10);
    const scores = computeScagnostics(x, y, xm, ym);
    for (const m of SCAGNOSTIC_MEASURES) {
      expect(typeof scores[m]).toBe("number");
    }
  });
});

describe("computeAllPairs", () => {
  it("computes scagnostics for all variable pairs", () => {
    const n = 50;
    const x1 = new Float64Array(n);
    const x2 = new Float64Array(n);
    const x3 = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      x1[i] = i;
      x2[i] = i * 2 + 1;
      x3[i] = Math.random();
    }
    const missing = makeMissing(n);

    const fakeDf = {
      nrow: n,
      columns: [
        { name: "a", type: "numeric", values: x1, missing: { buffer: missing } },
        { name: "b", type: "numeric", values: x2, missing: { buffer: missing } },
        { name: "c", type: "numeric", values: x3, missing: { buffer: missing } },
      ],
    };

    const results = computeAllPairs(fakeDf, ["a", "b", "c"]);
    expect(results.length).toBe(3); // C(3,2) = 3 pairs

    for (const r of results) {
      expect(allInRange(r.scores)).toBe(true);
    }

    // a vs b should be highly monotonic (linear relationship)
    const ab = results.find((r) => r.xVar === "a" && r.yVar === "b");
    expect(ab).toBeDefined();
    expect(ab!.scores.monotonic).toBeGreaterThan(0.8);
  });

  it("skips non-numeric columns", () => {
    const n = 20;
    const x = new Float64Array(n);
    const codes = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      x[i] = i;
      codes[i] = i % 3;
    }
    const missing = makeMissing(n);

    const fakeDf = {
      nrow: n,
      columns: [
        { name: "num", type: "numeric", values: x, missing: { buffer: missing } },
        { name: "cat", type: "categorical", values: codes, missing: { buffer: missing } },
      ],
    };

    const results = computeAllPairs(fakeDf, ["num", "cat"]);
    expect(results.length).toBe(0);
  });

  it("returns empty for single variable", () => {
    const n = 20;
    const x = new Float64Array(n);
    const missing = makeMissing(n);
    const fakeDf = {
      nrow: n,
      columns: [
        { name: "a", type: "numeric", values: x, missing: { buffer: missing } },
      ],
    };
    const results = computeAllPairs(fakeDf, ["a"]);
    expect(results.length).toBe(0);
  });
});
