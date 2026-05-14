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
  if (k === 3) return path3D(A, B, p);
  throw new Error(`tourPath: only k=1, 2, or 3 supported (got ${k})`);
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

function path3D(A: Mat, B: Mat, p: number): (t: number) => Mat {
  const M = at_b_k(A, B, 3);
  const { U, S, V } = svd3(M);
  const Q1 = mat_times_k(A, U, 3);
  const Q2 = mat_times_k(B, V, 3);
  const theta = [Math.acos(clamp(S[0]!, -1, 1)), Math.acos(clamp(S[1]!, -1, 1)), Math.acos(clamp(S[2]!, -1, 1))];
  const W = new Float64Array(p * 3);
  for (let j = 0; j < 3; j++) {
    const tj = theta[j]!;
    const cj = Math.cos(tj), sj = Math.sin(tj);
    if (sj < EPS) {
      for (let i = 0; i < p; i++) W[i * 3 + j] = Q1.values[i * 3 + j]!;
    } else {
      for (let i = 0; i < p; i++) {
        W[i * 3 + j] = (Q2.values[i * 3 + j]! - cj * Q1.values[i * 3 + j]!) / sj;
      }
    }
  }
  return (t: number) => {
    const out = new Float64Array(p * 3);
    for (let j = 0; j < 3; j++) {
      const tj = theta[j]!;
      const c = Math.cos(t * tj), s = Math.sin(t * tj);
      for (let i = 0; i < p; i++) {
        out[i * 3 + j] = c * Q1.values[i * 3 + j]! + s * W[i * 3 + j]!;
      }
    }
    return gramSchmidt(makeMat(p, 3, out));
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

function at_b_k(A: Mat, B: Mat, k: number): { values: Float64Array } {
  const out = new Float64Array(k * k);
  const p = A.nrow;
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      let s = 0;
      for (let r = 0; r < p; r++) s += A.values[r * k + i]! * B.values[r * k + j]!;
      out[i * k + j] = s;
    }
  }
  return { values: out };
}

function mat_times_k(A: Mat, M: { values: Float64Array }, k: number): Mat {
  const out = new Float64Array(A.nrow * k);
  for (let i = 0; i < A.nrow; i++) {
    for (let j = 0; j < k; j++) {
      let s = 0;
      for (let l = 0; l < k; l++) s += A.values[i * k + l]! * M.values[l * k + j]!;
      out[i * k + j] = s;
    }
  }
  return makeMat(A.nrow, k, out);
}

// 3×3 SVD via eigen-decomposition of M^T M (Jacobi) + Gram-Schmidt for U.
// Returns U, S (length 3), V such that M = U diag(S) V^T.
// V comes from eigenvectors of M^T M, S from sqrt of eigenvalues,
// and U = M V diag(1/S) re-orthonormalised via Gram-Schmidt.
function svd3(M: { values: Float64Array }): { U: { values: Float64Array }; S: number[]; V: { values: Float64Array } } {
  // 1) Form A = M^T M (symmetric 3×3)
  const A = new Float64Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = i; j < 3; j++) {
      let s = 0;
      for (let r = 0; r < 3; r++) s += M.values[r * 3 + i]! * M.values[r * 3 + j]!;
      A[i * 3 + j] = s;
      if (i !== j) A[j * 3 + i] = s;
    }
  }

  // 2) Jacobi eigen-decomposition of the 3×3 symmetric matrix A → eigenvalues, V
  const { eigenvalues, eigenvectors: V } = jacobi3x3(A);

  // 3) Singular values = sqrt(eigenvalues), sorted descending
  const order = [0, 1, 2].sort((a, b) => eigenvalues[b]! - eigenvalues[a]!);
  const S: number[] = new Array(3);
  const Vsorted = new Float64Array(9);
  for (let j = 0; j < 3; j++) {
    const src = order[j]!;
    S[j] = Math.sqrt(Math.max(0, eigenvalues[src]!));
    for (let i = 0; i < 3; i++) Vsorted[i * 3 + j] = V[i * 3 + src]!;
  }

  // 4) U = M V diag(1/sigma); for zero singular values use canonical basis
  const U = new Float64Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let l = 0; l < 3; l++) s += M.values[i * 3 + l]! * Vsorted[l * 3 + j]!;
      if (S[j]! >= EPS) U[i * 3 + j] = s / S[j]!;
    }
  }
  // Fill zero-sigma columns with canonical basis for Gram-Schmidt
  for (let j = 0; j < 3; j++) {
    if (S[j]! < EPS) {
      U[j * 3 + j] = 1;
    }
  }
  // Gram-Schmidt re-orthonormalise U
  const Umat = makeMat(3, 3, U);
  const Ugs = gramSchmidt(Umat);
  return { U: { values: Ugs.values }, S, V: { values: Vsorted } };
}

// Jacobi eigenvalue decomposition for a 3×3 symmetric matrix.
// Returns eigenvalues (length 3) and eigenvector matrix (column-major Float64Array(9)).
function jacobi3x3(A: Float64Array): { eigenvalues: number[]; eigenvectors: Float64Array } {
  const a = new Float64Array(A);
  const V = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const MAX_ITER = 50;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    // Find the largest off-diagonal element
    let maxOff = 0;
    let p = 0, q = 1;
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        const v = Math.abs(a[i * 3 + j]!);
        if (v > maxOff) { maxOff = v; p = i; q = j; }
      }
    }
    if (maxOff < 1e-15) break;

    // Compute rotation angle
    const app = a[p * 3 + p]!;
    const aqq = a[q * 3 + q]!;
    const apq = a[p * 3 + q]!;
    let c: number, s: number;
    if (Math.abs(app - aqq) < 1e-30) {
      c = Math.SQRT1_2;
      s = Math.SQRT1_2;
    } else {
      const tau = (aqq - app) / (2 * apq);
      const t = tau >= 0
        ? 1 / (tau + Math.sqrt(1 + tau * tau))
        : -1 / (-tau + Math.sqrt(1 + tau * tau));
      c = 1 / Math.sqrt(1 + t * t);
      s = t * c;
    }

    // Update a
    a[p * 3 + p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    a[q * 3 + q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    a[p * 3 + q] = 0;
    a[q * 3 + p] = 0;
    for (let r = 0; r < 3; r++) {
      if (r === p || r === q) continue;
      const arp = a[r * 3 + p]!;
      const arq = a[r * 3 + q]!;
      a[r * 3 + p] = c * arp - s * arq;
      a[p * 3 + r] = a[r * 3 + p]!;
      a[r * 3 + q] = s * arp + c * arq;
      a[q * 3 + r] = a[r * 3 + q]!;
    }

    // Update V
    for (let r = 0; r < 3; r++) {
      const vrp = V[r * 3 + p]!;
      const vrq = V[r * 3 + q]!;
      V[r * 3 + p] = c * vrp - s * vrq;
      V[r * 3 + q] = s * vrp + c * vrq;
    }
  }

  return {
    eigenvalues: [a[0]!, a[4]!, a[8]!],
    eigenvectors: V,
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
