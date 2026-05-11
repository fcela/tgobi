import type { Mat } from "@/lib/linalg/types";
import { makeMat } from "@/lib/linalg/types";
import { gramSchmidt } from "@/lib/linalg/qr";

const EPS = 1e-12;

// Return a function t -> p×k orthonormal frame on the geodesic from A to B.
export function tourPath(A: Mat, B: Mat): (t: number) => Mat {
  if (A.nrow !== B.nrow || A.ncol !== B.ncol) {
    throw new Error("tourPath: shape mismatch");
  }
  const p = A.nrow, k = A.ncol;
  if (k === 1) return path1D(A, B, p);
  if (k === 2) return path2D(A, B, p);
  throw new Error(`tourPath: only k=1 or k=2 supported in M4 (got ${k})`);
}

function path1D(A: Mat, B: Mat, p: number): (t: number) => Mat {
  let d = 0;
  for (let i = 0; i < p; i++) d += A.values[i]! * B.values[i]!;
  if (d > 1) d = 1; else if (d < -1) d = -1;
  const theta = Math.acos(d);
  if (theta < EPS) {
    return () => copy(A);
  }
  const sinTheta = Math.sin(theta);
  return (t: number) => {
    const out = new Float64Array(p);
    const c1 = Math.sin((1 - t) * theta) / sinTheta;
    const c2 = Math.sin(t * theta) / sinTheta;
    for (let i = 0; i < p; i++) {
      out[i] = c1 * A.values[i]! + c2 * B.values[i]!;
    }
    return makeMat(p, 1, out);
  };
}

function path2D(A: Mat, B: Mat, p: number): (t: number) => Mat {
  // 1) M = A^T B (2x2)
  const M = at_b(A, B);
  // 2) SVD of 2x2 closed form: M = U S V^T
  const { U, S, V } = svd2(M);
  // 3) Q1 = A U, Q2 = B V (rotated frames)
  const Q1 = mat_times_2x2(A, U);
  const Q2 = mat_times_2x2(B, V);
  // 4) Principal angles
  const theta = [Math.acos(clamp(S[0]!, -1, 1)), Math.acos(clamp(S[1]!, -1, 1))];
  // 5) For each column, geodesic is Q1[:, j] cos(t θ_j) + W[:, j] sin(t θ_j)
  //    where W is the orthogonal complement: W[:, j] = (Q2[:, j] - cos(θ_j) Q1[:, j]) / sin(θ_j)
  const W = new Float64Array(p * 2);
  for (let j = 0; j < 2; j++) {
    const tj = theta[j]!;
    const cj = Math.cos(tj), sj = Math.sin(tj);
    if (sj < EPS) {
      for (let i = 0; i < p; i++) W[i * 2 + j] = Q1.values[i * 2 + j]!;
    } else {
      for (let i = 0; i < p; i++) {
        W[i * 2 + j] = (Q2.values[i * 2 + j]! - cj * Q1.values[i * 2 + j]!) / sj;
      }
    }
  }
  return (t: number) => {
    const out = new Float64Array(p * 2);
    for (let j = 0; j < 2; j++) {
      const tj = theta[j]!;
      const c = Math.cos(t * tj), s = Math.sin(t * tj);
      for (let i = 0; i < p; i++) {
        out[i * 2 + j] = c * Q1.values[i * 2 + j]! + s * W[i * 2 + j]!;
      }
    }
    return gramSchmidt(makeMat(p, 2, out));
  };
}

// helpers --------------------------------------------------------

function copy(A: Mat): Mat {
  return makeMat(A.nrow, A.ncol, new Float64Array(A.values));
}

function at_b(A: Mat, B: Mat): { values: Float64Array } {
  const out = new Float64Array(4);
  const p = A.nrow;
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      let s = 0;
      for (let r = 0; r < p; r++) s += A.values[r * 2 + i]! * B.values[r * 2 + j]!;
      out[i * 2 + j] = s;
    }
  }
  return { values: out };
}

function mat_times_2x2(A: Mat, M: { values: Float64Array }): Mat {
  const out = new Float64Array(A.nrow * 2);
  for (let i = 0; i < A.nrow; i++) {
    out[i * 2 + 0] = A.values[i * 2]! * M.values[0]! + A.values[i * 2 + 1]! * M.values[2]!;
    out[i * 2 + 1] = A.values[i * 2]! * M.values[1]! + A.values[i * 2 + 1]! * M.values[3]!;
  }
  return makeMat(A.nrow, 2, out);
}

// 2x2 SVD via the analytic formula. Input M, output U, S (length 2), V s.t. M = U diag(S) V^T.
// When a singular value is near zero, the corresponding singular vectors are degenerate
// (any orthonormal choice works); we use the canonical basis column in that case.
function svd2(M: { values: Float64Array }): { U: { values: Float64Array }; S: number[]; V: { values: Float64Array } } {
  const a = M.values[0]!, b = M.values[1]!, c = M.values[2]!, d = M.values[3]!;
  const E = a * a + b * b + c * c + d * d;
  const F = a * a + b * b - c * c - d * d;
  const G = 2 * (a * c + b * d);
  const Q = Math.sqrt(F * F + G * G);
  const sigma1 = Math.sqrt((E + Q) / 2);
  const sigma2 = Math.sqrt(Math.max(0, (E - Q) / 2));
  const phi = 0.5 * Math.atan2(G, F);
  const cphi = Math.cos(phi), sphi = Math.sin(phi);
  const V = new Float64Array([cphi, -sphi, sphi, cphi]);
  // U columns: u_j = (1/sigma_j) * M * v_j
  // When sigma_j < EPS the direction is degenerate; fall back to the j-th canonical basis vector.
  let u00: number, u10: number, u01: number, u11: number;
  if (sigma1 < EPS) {
    u00 = 1; u10 = 0;
  } else {
    u00 = (a * cphi + c * sphi) / sigma1;
    u10 = (b * cphi + d * sphi) / sigma1;
  }
  if (sigma2 < EPS) {
    u01 = 0; u11 = 1;
  } else {
    u01 = (-a * sphi + c * cphi) / sigma2;
    u11 = (-b * sphi + d * cphi) / sigma2;
  }
  const U = new Float64Array([u00, u01, u10, u11]);
  return { U: { values: U }, S: [sigma1, sigma2], V: { values: V } };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
