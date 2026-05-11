import { describe, expect, it } from "vitest";
import { makeMat } from "@/lib/linalg/types";
import { mulberry32 } from "@/lib/linalg/random";
import { projectionPursuitValue } from "@/lib/tour-pp/indices";
import { projectionPursuitTarget } from "@/lib/tour-pp/optimizer";

const close = (a: number, b: number, eps = 1e-7) => Math.abs(a - b) < eps;

describe("projectionPursuitTarget", () => {
  it("moves a 1D basis toward higher PCA variance", () => {
    const X = makeMat(6, 2, new Float64Array([
      -3, 0,
      -2, 0.1,
      -1, -0.1,
      1, 0,
      2, 0.1,
      3, -0.1,
    ]));
    const current = makeMat(2, 1, new Float64Array([0, 1]));
    const startValue = projectionPursuitValue(X, current, "pca");
    const target = projectionPursuitTarget(X, current, "pca", mulberry32(123), {
      steps: 240,
      temperature: 0,
    });

    expect(target.value).toBeGreaterThan(startValue);
  });

  it("returns an orthonormal 2D basis", () => {
    const X = makeMat(5, 3, new Float64Array([
      -2, 0, 1,
      -1, 1, 0,
      0, 0, -1,
      1, -1, 0,
      2, 0, 1,
    ]));
    const current = makeMat(3, 2, new Float64Array([1, 0, 0, 1, 0, 0]));
    const target = projectionPursuitTarget(X, current, "holes", mulberry32(8), { steps: 80 });
    let g00 = 0;
    let g01 = 0;
    let g11 = 0;
    for (let i = 0; i < target.basis.nrow; i++) {
      const a = target.basis.values[i * 2]!;
      const b = target.basis.values[i * 2 + 1]!;
      g00 += a * a;
      g01 += a * b;
      g11 += b * b;
    }
    expect(close(g00, 1)).toBe(true);
    expect(close(g01, 0)).toBe(true);
    expect(close(g11, 1)).toBe(true);
  });

  it("moves a 1D basis toward higher LDA separation", () => {
    const X = makeMat(6, 2, new Float64Array([
      -3, 0,
      -2, 0.1,
      -1, -0.1,
      1, 0,
      2, 0.1,
      3, -0.1,
    ]));
    const labels = new Int32Array([0, 0, 0, 1, 1, 1]);
    const current = makeMat(2, 1, new Float64Array([0, 1]));
    const startValue = projectionPursuitValue(X, current, "lda", labels);
    const target = projectionPursuitTarget(X, current, "lda", mulberry32(456), {
      steps: 240,
      temperature: 0,
    }, labels);

    expect(target.value).toBeGreaterThan(startValue);
  });

  it("moves a 2D basis toward an LDA separating subspace", () => {
    const X = makeMat(8, 4, new Float64Array([
      -3, 0, 0.2, 0,
      -2, 0.1, -0.2, 0,
      -1, -0.1, 0.1, 0,
      -2.5, 0, 0, 0.2,
      1, 0, -0.1, 0,
      2, -0.1, 0.2, 0,
      3, 0.1, 0, -0.2,
      2.5, 0, -0.2, 0,
    ]));
    const labels = new Int32Array([0, 0, 0, 0, 1, 1, 1, 1]);
    const current = makeMat(4, 2, new Float64Array([
      0, 0,
      1, 0,
      0, 1,
      0, 0,
    ]));
    const startValue = projectionPursuitValue(X, current, "lda", labels);
    const target = projectionPursuitTarget(X, current, "lda", mulberry32(789), {}, labels);

    expect(target.value).toBeGreaterThan(startValue);
  });
});
