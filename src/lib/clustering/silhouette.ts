import type { ClusterResult } from "./types";

export interface SilhouetteResult {
  scores: Float64Array;
  mean: number;
  perCluster: { id: number; mean: number; size: number }[];
}

export function silhouette(
  data: number[][],
  result: ClusterResult,
): SilhouetteResult {
  const n = data.length;
  if (n === 0 || result.k < 2) {
    return { scores: new Float64Array(0), mean: 0, perCluster: [] };
  }

  const { assignments, k } = result;
  const scores = new Float64Array(n);

  const clusterMembers: Map<number, number[]> = new Map();
  for (let i = 0; i < n; i++) {
    const c = assignments[i]!;
    if (c < 0) continue;
    if (!clusterMembers.has(c)) clusterMembers.set(c, []);
    clusterMembers.get(c)!.push(i);
  }

  const dist = (a: number[], b: number[]): number => {
    let sum = 0;
    for (let d = 0; d < a.length; d++) {
      const diff = a[d]! - b[d]!;
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  };

  const clusterMeans: Map<number, number> = new Map();
  let totalSum = 0;
  let totalCount = 0;

  for (let i = 0; i < n; i++) {
    const ci = assignments[i]!;
    if (ci < 0) {
      scores[i] = 0;
      continue;
    }

    const sameCluster = clusterMembers.get(ci)!;

    if (sameCluster.length <= 1) {
      scores[i] = 0;
      continue;
    }

    let aSum = 0;
    for (const j of sameCluster) {
      if (j === i) continue;
      aSum += dist(data[i]!, data[j]!);
    }
    const a = aSum / (sameCluster.length - 1);

    let minB = Infinity;
    for (const [cj, members] of clusterMembers) {
      if (cj === ci) continue;
      let bSum = 0;
      for (const j of members) {
        bSum += dist(data[i]!, data[j]!);
      }
      const b = bSum / members.length;
      if (b < minB) minB = b;
    }

    if (!Number.isFinite(minB)) {
      scores[i] = 0;
    } else {
      const denom = Math.max(a, minB);
      scores[i] = denom === 0 ? 0 : (minB - a) / denom;
    }

    totalSum += scores[i]!;
    totalCount++;
  }

  const mean = totalCount > 0 ? totalSum / totalCount : 0;

  const perCluster: SilhouetteResult["perCluster"] = [];
  for (const [id, members] of clusterMembers) {
    let sum = 0;
    for (const i of members) sum += scores[i]!;
    perCluster.push({ id, mean: members.length > 0 ? sum / members.length : 0, size: members.length });
  }
  perCluster.sort((a, b) => b.mean - a.mean);

  return { scores, mean, perCluster };
}
