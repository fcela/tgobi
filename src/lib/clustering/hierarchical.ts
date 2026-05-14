import { agnes } from "ml-hclust";
import type { ClusterResult } from "./types";

export type Linkage = "single" | "complete" | "average";

export function agglomerative(
  data: (number | null)[][],
  k: number,
  linkage: Linkage = "complete",
): ClusterResult {
  const n = data.length;
  if (n === 0 || k <= 0) return { assignments: new Int16Array(0), k: 0, sizes: [] };
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
  const m = validIndices.length;
  if (m <= k) {
    for (let i = 0; i < m; i++) assignments[validIndices[i]!] = i;
    return { assignments, k: m, sizes: validIndices.map(() => 1) };
  }

  const clean = validIndices.map((i) => data[i]! as number[]);
  const tree = agnes(clean, { method: linkage });
  const grouped = tree.group(k);

  const sizes: number[] = [];
  for (let g = 0; g < grouped.children.length; g++) {
    const members = grouped.children[g]!.indices();
    for (const localIdx of members) {
      assignments[validIndices[localIdx]!] = g;
    }
    sizes.push(members.length);
  }

  return { assignments, k: sizes.length, sizes };
}
