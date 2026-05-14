import { describe, it, expect } from "vitest";
import { makeMat } from "@/lib/linalg/types";
import { tourPath } from "@/lib/linalg/geodesic";

const close = (a: number, b: number, eps = 1e-8) => Math.abs(a - b) < eps;

describe("tourPath k=1 (slerp on a sphere)", () => {
  it("t=0 returns A and t=1 returns B (up to sign)", () => {
    const A = makeMat(3, 1, new Float64Array([1, 0, 0]));
    const B = makeMat(3, 1, new Float64Array([0, 1, 0]));
    const path = tourPath(A, B);
    const A0 = path(0); const B1 = path(1);
    expect(close(A0.values[0]!, 1)).toBe(true);
    expect(close(A0.values[1]!, 0)).toBe(true);
    expect(close(B1.values[0]!, 0)).toBe(true);
    expect(close(B1.values[1]!, 1)).toBe(true);
  });

  it("t=0.5 lies on the great circle, halfway", () => {
    const A = makeMat(3, 1, new Float64Array([1, 0, 0]));
    const B = makeMat(3, 1, new Float64Array([0, 1, 0]));
    const path = tourPath(A, B);
    const M = path(0.5);
    expect(close(M.values[0]!, Math.SQRT1_2)).toBe(true);
    expect(close(M.values[1]!, Math.SQRT1_2)).toBe(true);
  });

  it("identical A and B → constant path", () => {
    const A = makeMat(3, 1, new Float64Array([1, 0, 0]));
    const path = tourPath(A, A);
    const M = path(0.5);
    expect(close(M.values[0]!, 1)).toBe(true);
  });
});

describe("tourPath k=2", () => {
  it("returns an orthonormal frame at every t", () => {
    const A = makeMat(4, 2, new Float64Array([1, 0, 0, 1, 0, 0, 0, 0]));
    const B = makeMat(4, 2, new Float64Array([0, 0, 0, 0, 1, 0, 0, 1]));
    const path = tourPath(A, B);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const M = path(t);
      let g00 = 0, g01 = 0, g11 = 0;
      for (let i = 0; i < 4; i++) {
        const a = M.values[i * 2]!;
        const b = M.values[i * 2 + 1]!;
        g00 += a * a;
        g01 += a * b;
        g11 += b * b;
      }
      expect(close(g00, 1, 1e-7)).toBe(true);
      expect(close(g11, 1, 1e-7)).toBe(true);
      expect(close(g01, 0, 1e-7)).toBe(true);
    }
  });

  it("t=0 returns A", () => {
    const A = makeMat(4, 2, new Float64Array([1, 0, 0, 1, 0, 0, 0, 0]));
    const B = makeMat(4, 2, new Float64Array([0, 0, 0, 0, 1, 0, 0, 1]));
    const path = tourPath(A, B);
    const M0 = path(0);
    for (let i = 0; i < 8; i++) {
      expect(close(M0.values[i]!, A.values[i]!, 1e-7)).toBe(true);
    }
  });
});

describe("tourPath k=3", () => {
  const A3d = makeMat(6, 3, new Float64Array([
    1, 0, 0,
    0, 1, 0,
    0, 0, 1,
    0, 0, 0,
    0, 0, 0,
    0, 0, 0,
  ]));
  const B3d = makeMat(6, 3, new Float64Array([
    0, 0, 0,
    0, 0, 0,
    0, 0, 0,
    0, 1, 0,
    0, 0, 1,
    1, 0, 0,
  ]));

  it("returns an orthonormal frame at every t", () => {
    const path = tourPath(A3d, B3d);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const M = path(t);
      for (let c1 = 0; c1 < 3; c1++) {
        for (let c2 = c1; c2 < 3; c2++) {
          let dot = 0;
          for (let i = 0; i < 6; i++) dot += M.values[i * 3 + c1]! * M.values[i * 3 + c2]!;
          const expected = c1 === c2 ? 1 : 0;
          expect(close(dot, expected, 1e-6)).toBe(true);
        }
      }
    }
  });

  it("t=0 returns an orthonormal frame and t=1 returns a different orthonormal frame", () => {
    const path = tourPath(A3d, B3d);
    const M0 = path(0);
    const M1 = path(1);
    for (const M of [M0, M1]) {
      for (let c1 = 0; c1 < 3; c1++) {
        for (let c2 = c1; c2 < 3; c2++) {
          let dot = 0;
          for (let i = 0; i < 6; i++) dot += M.values[i * 3 + c1]! * M.values[i * 3 + c2]!;
          const expected = c1 === c2 ? 1 : 0;
          expect(close(dot, expected, 1e-6)).toBe(true);
        }
      }
    }
    let same = true;
    for (let i = 0; i < 18; i++) {
      if (!close(M0.values[i]!, M1.values[i]!, 1e-6)) { same = false; break; }
    }
    expect(same).toBe(false);
  });

  it("interpolates smoothly — midpoint has non-zero entries", () => {
    const path = tourPath(A3d, B3d);
    const M = path(0.5);
    let anyNonzero = false;
    for (let i = 0; i < 18; i++) {
      if (Math.abs(M.values[i]!) > 1e-6) anyNonzero = true;
    }
    expect(anyNonzero).toBe(true);
  });
});
