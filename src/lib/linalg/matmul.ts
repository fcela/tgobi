import type { Mat } from "@/lib/linalg/types";
import { makeMat } from "@/lib/linalg/types";

export function multiply(A: Mat, B: Mat): Mat {
  if (A.ncol !== B.nrow)
    throw new Error(`multiply: dim mismatch A.ncol ${A.ncol} != B.nrow ${B.nrow}`);
  const out = new Float64Array(A.nrow * B.ncol);
  const Av = A.values,
    Bv = B.values;
  const ka = A.ncol;
  for (let i = 0; i < A.nrow; i++) {
    for (let j = 0; j < B.ncol; j++) {
      let s = 0;
      for (let k = 0; k < ka; k++) s += Av[i * ka + k]! * Bv[k * B.ncol + j]!;
      out[i * B.ncol + j] = s;
    }
  }
  return makeMat(A.nrow, B.ncol, out);
}
