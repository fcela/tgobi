import { describe, it, expect } from "vitest";
import { makeMat } from "@/lib/linalg/types";
import { multiply } from "@/lib/linalg/matmul";

describe("multiply", () => {
  it("[2x3] * [3x2]", () => {
    const A = makeMat(2, 3, new Float64Array([1, 2, 3, 4, 5, 6]));
    const B = makeMat(3, 2, new Float64Array([7, 8, 9, 10, 11, 12]));
    const C = multiply(A, B);
    expect(C.nrow).toBe(2);
    expect(C.ncol).toBe(2);
    expect(Array.from(C.values)).toEqual([58, 64, 139, 154]);
  });

  it("rejects mismatched dims", () => {
    const A = makeMat(2, 3, new Float64Array(6));
    const B = makeMat(2, 2, new Float64Array(4));
    expect(() => multiply(A, B)).toThrow(/dim/);
  });

  it("identity", () => {
    const I = makeMat(3, 3, new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]));
    const X = makeMat(3, 2, new Float64Array([1, 2, 3, 4, 5, 6]));
    const Y = multiply(I, X);
    expect(Array.from(Y.values)).toEqual(Array.from(X.values));
  });
});
