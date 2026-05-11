import { describe, it, expect } from "vitest";
import { makeMat } from "@/lib/linalg/types";
import { gramSchmidt } from "@/lib/linalg/qr";
import { multiply } from "@/lib/linalg/matmul";

const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

describe("gramSchmidt (orthonormalise columns)", () => {
  it("identity passes through", () => {
    const I = makeMat(3, 2, new Float64Array([1, 0, 0, 1, 0, 0]));
    const Q = gramSchmidt(I);
    expect(Q.nrow).toBe(3);
    expect(Q.ncol).toBe(2);
    const QT = transpose(Q);
    const G = multiply(QT, Q);
    expect(close(G.values[0]!, 1)).toBe(true);
    expect(close(G.values[1]!, 0)).toBe(true);
    expect(close(G.values[2]!, 0)).toBe(true);
    expect(close(G.values[3]!, 1)).toBe(true);
  });

  it("orthonormalises arbitrary 4x2", () => {
    const A = makeMat(4, 2, new Float64Array([1, 1, 2, 0, 3, 1, 4, 0]));
    const Q = gramSchmidt(A);
    const QT = transpose(Q);
    const G = multiply(QT, Q);
    expect(close(G.values[0]!, 1)).toBe(true);
    expect(close(G.values[1]!, 0)).toBe(true);
    expect(close(G.values[3]!, 1)).toBe(true);
  });

  it("rejects rank-deficient input", () => {
    const A = makeMat(3, 2, new Float64Array([1, 2, 2, 4, 3, 6]));
    expect(() => gramSchmidt(A)).toThrow(/rank/i);
  });
});

function transpose(M: { values: Float64Array; nrow: number; ncol: number }) {
  const out = new Float64Array(M.nrow * M.ncol);
  for (let i = 0; i < M.nrow; i++) {
    for (let j = 0; j < M.ncol; j++) out[j * M.nrow + i] = M.values[i * M.ncol + j]!;
  }
  return makeMat(M.ncol, M.nrow, out);
}
