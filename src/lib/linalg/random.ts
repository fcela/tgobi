import type { Mat } from "@/lib/linalg/types";
import { makeMat } from "@/lib/linalg/types";
import { gramSchmidt } from "@/lib/linalg/qr";

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rng: () => number): number {
  let u = 0,
    v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function randomBasis(p: number, k: number, rng: () => number): Mat {
  if (p < k) throw new Error(`randomBasis: p ${p} must be >= k ${k}`);
  const A = new Float64Array(p * k);
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < k; j++) A[i * k + j] = gauss(rng);
  }
  return gramSchmidt(makeMat(p, k, A));
}
