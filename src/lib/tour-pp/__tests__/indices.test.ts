import { describe, expect, it } from "vitest";
import { makeMat } from "@/lib/linalg/types";
import { projectionPursuitValueForProjection } from "@/lib/tour-pp/indices";

describe("projection pursuit indices", () => {
  it("holes and central mass prefer opposite center-density structure", () => {
    const centerMass = makeMat(5, 1, new Float64Array([0, 0, 0, -3, 3]));
    const hole = makeMat(4, 1, new Float64Array([-1, -1, 1, 1]));

    expect(projectionPursuitValueForProjection(centerMass, "centralMass"))
      .toBeGreaterThan(projectionPursuitValueForProjection(hole, "centralMass"));
    expect(projectionPursuitValueForProjection(hole, "holes"))
      .toBeGreaterThan(projectionPursuitValueForProjection(centerMass, "holes"));
  });

  it("pca returns total projected variance", () => {
    const flat = makeMat(3, 1, new Float64Array([2, 2, 2]));
    const spread = makeMat(3, 1, new Float64Array([0, 1, 2]));
    expect(projectionPursuitValueForProjection(flat, "pca")).toBe(0);
    expect(projectionPursuitValueForProjection(spread, "pca")).toBeCloseTo(1);
  });

  it("kurtosis is finite for constant projections", () => {
    const flat = makeMat(4, 2, new Float64Array([1, 1, 1, 1, 1, 1, 1, 1]));
    expect(Number.isFinite(projectionPursuitValueForProjection(flat, "kurtosis"))).toBe(true);
  });

  it("lda prefers projections that separate class labels", () => {
    const separated = makeMat(4, 1, new Float64Array([-2, -1, 1, 2]));
    const mixed = makeMat(4, 1, new Float64Array([-2, 2, -1, 1]));
    const labels = new Int32Array([0, 0, 1, 1]);
    expect(projectionPursuitValueForProjection(separated, "lda", labels))
      .toBeGreaterThan(projectionPursuitValueForProjection(mixed, "lda", labels));
  });
});
