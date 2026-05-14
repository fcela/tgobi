import { DBSCAN } from "density-clustering";
import type { ClusterResult } from "./types";

export function dbscan(
  data: (number | null)[][],
  eps: number,
  minPts: number,
): ClusterResult {
  const n = data.length;
  if (n === 0) return { assignments: new Int16Array(0), k: 0, sizes: [] };
  const p = data[0]!.length;

  const validIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    let hasMissing = false;
    for (let j = 0; j < p; j++) {
      if (data[i]![j] == null || !Number.isFinite(data[i]![j]!)) {
        hasMissing = true;
        break;
      }
    }
    if (!hasMissing) validIndices.push(i);
  }

  const assignments = new Int16Array(n).fill(-1);
  if (validIndices.length === 0) return { assignments, k: 0, sizes: [] };

  const clean = validIndices.map((i) => data[i]! as number[]);
  const solver = new DBSCAN();
  const clusters = solver.run(clean, eps, minPts);

  for (let g = 0; g < clusters.length; g++) {
    for (const localIdx of clusters[g]!) {
      assignments[validIndices[localIdx]!] = g;
    }
  }

  const sizes = clusters.map((c) => c.length);
  return { assignments, k: sizes.length, sizes };
}
