import type { Mat } from "@/lib/linalg/types";
import { makeMat } from "@/lib/linalg/types";

const EPS = 1e-12;

export function gramSchmidt(A: Mat): Mat {
  const m = A.nrow,
    k = A.ncol;
  const Q = new Float64Array(m * k);
  for (let j = 0; j < k; j++) {
    for (let i = 0; i < m; i++) Q[i * k + j] = A.values[i * k + j]!;
    for (let l = 0; l < j; l++) {
      let dot = 0;
      for (let i = 0; i < m; i++) dot += Q[i * k + j]! * Q[i * k + l]!;
      for (let i = 0; i < m; i++) Q[i * k + j] = Q[i * k + j]! - dot * Q[i * k + l]!;
    }
    let n2 = 0;
    for (let i = 0; i < m; i++) n2 += Q[i * k + j]! * Q[i * k + j]!;
    const n = Math.sqrt(n2);
    if (n < EPS) throw new Error("gramSchmidt: rank-deficient input");
    for (let i = 0; i < m; i++) Q[i * k + j] = Q[i * k + j]! / n;
  }
  return makeMat(m, k, Q);
}
