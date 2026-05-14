import { OPTICS } from "density-clustering";
import type { ClusterResult } from "./types";

export interface OpticsResult extends ClusterResult {
  ordering: Int32Array;
}

export function optics(
  data: (number | null)[][],
  eps: number,
  minPts: number,
  _xi: number,
): OpticsResult {
  const n = data.length;
  if (n === 0) return { assignments: new Int16Array(0), k: 0, sizes: [], ordering: new Int32Array(0) };
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
  if (validIndices.length === 0) return { assignments, k: 0, sizes: [], ordering: new Int32Array(0) };

  const clean = validIndices.map((i) => data[i]! as number[]);
  const solver = new OPTICS();
  const clusterIndices: number[][] = solver.run(clean, eps, minPts);

  const allOrdered: number[] = [];
  for (const cluster of clusterIndices) {
    for (const idx of cluster) allOrdered.push(idx);
  }
  for (let i = 0; i < validIndices.length; i++) {
    if (!allOrdered.includes(i)) allOrdered.push(i);
  }

  const orderArr = new Int32Array(allOrdered.length);
  for (let i = 0; i < allOrdered.length; i++) {
    orderArr[i] = validIndices[allOrdered[i]!] ?? -1;
  }

  for (let g = 0; g < clusterIndices.length; g++) {
    for (const localIdx of clusterIndices[g]!) {
      assignments[validIndices[localIdx]!] = g;
    }
  }

  const sizes = clusterIndices.map((c) => c.length);
  return { assignments, k: sizes.length, sizes, ordering: orderArr };
}
