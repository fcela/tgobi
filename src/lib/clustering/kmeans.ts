import { kmeans as mlKmeans } from "ml-kmeans";
import type { ClusterResult } from "./types";

export function kMeans(
  data: (number | null)[][],
  k: number,
  opts?: { maxIter?: number; seed?: number },
): ClusterResult {
  const { maxIter = 100, seed = 42 } = opts ?? {};
  const n = data.length;
  if (n === 0 || k <= 0) return { assignments: new Int16Array(0), k: 0, sizes: [] };
  const p = data[0]!.length;
  if (p === 0) return { assignments: new Int16Array(n).fill(-1), k: 0, sizes: [] };

  const valid: number[] = [];
  for (let i = 0; i < n; i++) {
    let hasMissing = false;
    for (let j = 0; j < p; j++) {
      if (data[i]![j] == null || !Number.isFinite(data[i]![j]!)) {
        hasMissing = true;
        break;
      }
    }
    if (!hasMissing) valid.push(i);
  }

  const assignments = new Int16Array(n).fill(-1);
  if (valid.length < k) {
    for (let i = 0; i < valid.length; i++) assignments[valid[i]!] = i;
    const sizes = new Array<number>(valid.length).fill(1);
    while (sizes.length < k) sizes.push(0);
    return { assignments, k, sizes };
  }

  const clean = valid.map((i) => data[i]! as number[]);
  const result = mlKmeans(clean, k, {
    initialization: "kmeans++",
    maxIterations: maxIter,
    seed,
  });

  for (let i = 0; i < valid.length; i++) {
    assignments[valid[i]!] = result.clusters[i]!;
  }

  const sizes = new Array<number>(k).fill(0);
  for (let i = 0; i < valid.length; i++) {
    sizes[assignments[valid[i]!]!]!++;
  }

  return { assignments, k, sizes };
}
