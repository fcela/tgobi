import { describe, it, expect } from "vitest";
import { randomBasis, mulberry32 } from "@/lib/linalg/random";
import { multiply } from "@/lib/linalg/matmul";

const close = (a: number, b: number, eps = 1e-8) => Math.abs(a - b) < eps;

describe("randomBasis", () => {
  it("p=5 k=2 produces an orthonormal frame", () => {
    const rng = mulberry32(42);
    const Q = randomBasis(5, 2, rng);
    const QT_values = new Float64Array(Q.ncol * Q.nrow);
    for (let i = 0; i < Q.nrow; i++) {
      for (let j = 0; j < Q.ncol; j++) QT_values[j * Q.nrow + i] = Q.values[i * Q.ncol + j]!;
    }
    const QT = { values: QT_values, nrow: Q.ncol, ncol: Q.nrow };
    const G = multiply(QT, Q);
    expect(close(G.values[0]!, 1)).toBe(true);
    expect(close(G.values[1]!, 0)).toBe(true);
    expect(close(G.values[3]!, 1)).toBe(true);
  });

  it("seeded rng is deterministic", () => {
    const r1 = mulberry32(7);
    const r2 = mulberry32(7);
    expect(r1()).toBe(r2());
    expect(r1()).toBe(r2());
  });

  it("k=1 returns a unit vector", () => {
    const rng = mulberry32(3);
    const Q = randomBasis(6, 1, rng);
    let n = 0;
    for (let i = 0; i < Q.nrow; i++) n += Q.values[i]! * Q.values[i]!;
    expect(close(n, 1)).toBe(true);
  });
});
