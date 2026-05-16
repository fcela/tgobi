import { describe, it, expect } from "vitest";
import { makeMat } from "@/lib/linalg/types";
import { buildKeyframeSpline, geodesicDistance, findSegment, arcLengthToU } from "@/lib/linalg/catmullRom";

const close = (a: number, b: number, eps = 1e-8) => Math.abs(a - b) < eps;

describe("geodesicDistance", () => {
  it("returns 0 for identical frames", () => {
    const A = makeMat(3, 2, new Float64Array([1, 0, 0, 1, 0, 0]));
    expect(geodesicDistance(A, A)).toBeCloseTo(0, 6);
  });

  it("returns positive distance for different frames", () => {
    const A = makeMat(3, 2, new Float64Array([1, 0, 0, 1, 0, 0]));
    const B = makeMat(3, 2, new Float64Array([0, 0, 1, 0, 0, 1]));
    const d = geodesicDistance(A, B);
    expect(d).toBeGreaterThan(0);
  });

  it("1D geodesic distance: orthogonal vectors have distance pi/2", () => {
    const A = makeMat(2, 1, new Float64Array([1, 0]));
    const B = makeMat(2, 1, new Float64Array([0, 1]));
    expect(geodesicDistance(A, B)).toBeCloseTo(Math.PI / 2, 5);
  });
});

describe("buildKeyframeSpline", () => {
  it("requires at least 2 keyframes", () => {
    const A = makeMat(3, 2, new Float64Array([1, 0, 0, 1, 0, 0]));
    expect(() => buildKeyframeSpline([A])).toThrow();
  });

  it("returns an orthonormal frame at u=0 (first keyframe)", () => {
    const A = makeMat(4, 2, new Float64Array([1, 0, 0, 1, 0, 0, 0, 0]));
    const B = makeMat(4, 2, new Float64Array([0, 0, 0, 0, 1, 0, 0, 1]));
    const spline = buildKeyframeSpline([A, B]);
    const F = spline.eval(0);
    expect(F.nrow).toBe(4);
    expect(F.ncol).toBe(2);
    for (let c1 = 0; c1 < 2; c1++) {
      for (let c2 = c1; c2 < 2; c2++) {
        let dot = 0;
        for (let i = 0; i < 4; i++) dot += F.values[i * 2 + c1]! * F.values[i * 2 + c2]!;
        expect(close(dot, c1 === c2 ? 1 : 0, 1e-7)).toBe(true);
      }
    }
  });

  it("returns orthonormal frames at various u", () => {
    const A = makeMat(4, 2, new Float64Array([1, 0, 0, 1, 0, 0, 0, 0]));
    const B = makeMat(4, 2, new Float64Array([0, 0, 0, 0, 1, 0, 0, 1]));
    const C = makeMat(4, 2, new Float64Array([1, 0, 0, -1, 0, 0, 0, 0]));
    const spline = buildKeyframeSpline([A, B, C]);
    for (const u of [0, 0.25, 0.5, 0.75, 1]) {
      const F = spline.eval(u);
      for (let c1 = 0; c1 < 2; c1++) {
        for (let c2 = c1; c2 < 2; c2++) {
          let dot = 0;
          for (let i = 0; i < 4; i++) dot += F.values[i * 2 + c1]! * F.values[i * 2 + c2]!;
          expect(close(dot, c1 === c2 ? 1 : 0, 1e-6)).toBe(true);
        }
      }
    }
  });

  it("clamp u outside [0,1]", () => {
    const A = makeMat(3, 2, new Float64Array([1, 0, 0, 1, 0, 0]));
    const B = makeMat(3, 2, new Float64Array([0, 1, 1, 0, 0, 0]));
    const spline = buildKeyframeSpline([A, B]);
    const Fneg = spline.eval(-0.5);
    const F0 = spline.eval(0);
    for (let i = 0; i < Fneg.values.length; i++) {
      expect(close(Fneg.values[i]!, F0.values[i]!, 1e-6)).toBe(true);
    }
  });

  it("computes positive arc length for non-identical keyframes", () => {
    const A = makeMat(4, 2, new Float64Array([1, 0, 0, 1, 0, 0, 0, 0]));
    const B = makeMat(4, 2, new Float64Array([0, 0, 0, 0, 1, 0, 0, 1]));
    const spline = buildKeyframeSpline([A, B]);
    expect(spline.totalArcLength).toBeGreaterThan(0);
  });

  it("works with 1D (k=1) keyframes", () => {
    const A = makeMat(3, 1, new Float64Array([1, 0, 0]));
    const B = makeMat(3, 1, new Float64Array([0, 1, 0]));
    const spline = buildKeyframeSpline([A, B]);
    const F = spline.eval(0.5);
    expect(F.nrow).toBe(3);
    expect(F.ncol).toBe(1);
    let norm = 0;
    for (let i = 0; i < 3; i++) norm += F.values[i]! * F.values[i]!;
    expect(close(norm, 1, 1e-7)).toBe(true);
  });

  it("3 keyframes: intermediate point is distinct from endpoints", () => {
    const A = makeMat(4, 2, new Float64Array([1, 0, 0, 1, 0, 0, 0, 0]));
    const B = makeMat(4, 2, new Float64Array([0, 0, 0, 0, 1, 0, 0, 1]));
    const C = makeMat(4, 2, new Float64Array([0, 1, 1, 0, 0, 0, 0, 0]));
    const spline = buildKeyframeSpline([A, B, C]);
    const mid = spline.eval(0.5);
    let sameAsA = true, sameAsC = true;
    const Aeval = spline.eval(0);
    const Ceval = spline.eval(1);
    for (let i = 0; i < 8; i++) {
      if (!close(mid.values[i]!, Aeval.values[i]!, 1e-4)) sameAsA = false;
      if (!close(mid.values[i]!, Ceval.values[i]!, 1e-4)) sameAsC = false;
    }
    expect(sameAsA || sameAsC).toBe(false);
  });
});

describe("findSegment", () => {
  it("finds the correct segment", () => {
    const arcLengths = new Float64Array([0, 1, 3, 6]);
    expect(findSegment(arcLengths, 0)).toBe(0);
    expect(findSegment(arcLengths, 0.5)).toBe(0);
    expect(findSegment(arcLengths, 1)).toBe(1);
    expect(findSegment(arcLengths, 2)).toBe(1);
    expect(findSegment(arcLengths, 5.9)).toBe(2);
    expect(findSegment(arcLengths, 6)).toBe(2);
  });
});

describe("arcLengthToU", () => {
  it("converts arc length to parameter u", () => {
    const A = makeMat(4, 2, new Float64Array([1, 0, 0, 1, 0, 0, 0, 0]));
    const B = makeMat(4, 2, new Float64Array([0, 0, 0, 0, 1, 0, 0, 1]));
    const spline = buildKeyframeSpline([A, B]);
    expect(spline.totalArcLength).toBeGreaterThan(0.01);
    expect(arcLengthToU(spline, 0)).toBe(0);
    expect(arcLengthToU(spline, spline.totalArcLength)).toBeCloseTo(1, 6);
    expect(arcLengthToU(spline, spline.totalArcLength / 2)).toBeCloseTo(0.5, 6);
  });
});
