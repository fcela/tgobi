import { describe, it, expect } from "vitest";
import { makeMat } from "@/lib/linalg/types";
import { applyFrozenRows3D, applyFrozenRowsPure, sqrtSym3 } from "@/lib/linalg/frozen";

const close = (a: number, b: number, eps = 1e-8) => Math.abs(a - b) < eps;

describe("sqrtSym3", () => {
  it("returns the square root of the identity matrix", () => {
    const I = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const sqrtI = sqrtSym3(I);
    for (let i = 0; i < 9; i++) {
      expect(close(sqrtI[i]!, I[i]!, 1e-6)).toBe(true);
    }
  });

  it("satisfies sqrt(A) * sqrt(A) ≈ A", () => {
    const A = new Float64Array([0.5, 0.1, 0, 0.1, 0.6, -0.05, 0, -0.05, 0.4]);
    const S = sqrtSym3(A);
    const S2 = new Float64Array(9);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        let s = 0;
        for (let l = 0; l < 3; l++) s += S[i * 3 + l]! * S[l * 3 + j]!;
        S2[i * 3 + j] = s;
      }
    }
    for (let i = 0; i < 9; i++) {
      expect(close(S2[i]!, A[i]!, 1e-6)).toBe(true);
    }
  });

  it("handles diagonal matrix", () => {
    const A = new Float64Array([4, 0, 0, 0, 9, 0, 0, 0, 1]);
    const S = sqrtSym3(A);
    expect(close(S[0]!, 2)).toBe(true);
    expect(close(S[4]!, 3)).toBe(true);
    expect(close(S[8]!, 1)).toBe(true);
    expect(close(S[1]!, 0, 1e-10)).toBe(true);
  });
});

describe("applyFrozenRows3D", () => {
  it("with no frozen rows, returns the candidate unchanged", () => {
    const candidate = makeMat(5, 3, new Float64Array([
      1, 0, 0,
      0, 1, 0,
      0, 0, 1,
      0, 0, 0,
      0, 0, 0,
    ]));
    const frozenRows = new Uint8Array(5);
    const frozenValues = new Float64Array(15);
    const result = applyFrozenRows3D(candidate, frozenRows, frozenValues);
    for (let i = 0; i < 15; i++) {
      expect(close(result.values[i]!, candidate.values[i]!)).toBe(true);
    }
  });

  it("frozen rows preserve their frozenValues direction", () => {
    const candidate = makeMat(5, 3, new Float64Array([
      1, 0, 0,
      0, 1, 0,
      0, 0, 1,
      0, 0, 0,
      0, 0, 0,
    ]));
    const frozenRows = new Uint8Array([1, 0, 0, 0, 0]);
    const frozenValues = new Float64Array(15);
    frozenValues[0] = 0.5; frozenValues[1] = 0.5; frozenValues[2] = 0.5;
    const result = applyFrozenRows3D(candidate, frozenRows, frozenValues);
    expect(close(result.values[0]!, 0.5)).toBe(true);
    expect(close(result.values[1]!, 0.5)).toBe(true);
    expect(close(result.values[2]!, 0.5)).toBe(true);
  });

  it("result is orthonormal (A^T A ≈ I)", () => {
    const candidate = makeMat(5, 3, new Float64Array([
      0.5, 0.2, 0.1,
      0.3, 0.6, 0.2,
      0.1, 0.1, 0.7,
      0.4, 0.3, 0.3,
      0.2, 0.4, 0.4,
    ]));
    const frozenRows = new Uint8Array([0, 0, 1, 0, 0]);
    const frozenValues = new Float64Array(15);
    frozenValues[9] = 0.6; frozenValues[10] = 0.3; frozenValues[11] = 0.2;
    const result = applyFrozenRows3D(candidate, frozenRows, frozenValues);
    for (let c1 = 0; c1 < 3; c1++) {
      for (let c2 = c1; c2 < 3; c2++) {
        let dot = 0;
        for (let i = 0; i < 5; i++) dot += result.values[i * 3 + c1]! * result.values[i * 3 + c2]!;
        const expected = c1 === c2 ? 1 : 0;
        expect(close(dot, expected, 1e-6)).toBe(true);
      }
    }
  });
});

describe("applyFrozenRowsPure", () => {
  it("k=1 with one frozen row produces unit-norm result", () => {
    const candidate = makeMat(4, 1, new Float64Array([0.5, 0.5, 0.5, 0.5]));
    const frozenRows = new Uint8Array([1, 0, 0, 0]);
    const frozenValues = new Float64Array(4);
    frozenValues[0] = 0.6;
    const result = applyFrozenRowsPure(candidate, frozenRows, frozenValues);
    expect(close(result.values[0]!, 0.6)).toBe(true);
    let norm = 0;
    for (let i = 0; i < 4; i++) norm += result.values[i]! * result.values[i]!;
    expect(close(norm, 1, 1e-6)).toBe(true);
  });

  it("k=2 with no frozen rows returns candidate unchanged", () => {
    const candidate = makeMat(4, 2, new Float64Array([1, 0, 0, 1, 0, 0, 0, 0]));
    const frozenRows = new Uint8Array(4);
    const frozenValues = new Float64Array(8);
    const result = applyFrozenRowsPure(candidate, frozenRows, frozenValues);
    for (let i = 0; i < 8; i++) {
      expect(close(result.values[i]!, candidate.values[i]!)).toBe(true);
    }
  });
});
