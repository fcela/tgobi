import { kmeans as mlKmeans } from "ml-kmeans";
import type { ClusterResult } from "./types";

export function xMeans(
  data: (number | null)[][],
  kMax: number,
): ClusterResult {
  const n = data.length;
  if (n === 0) return { assignments: new Int16Array(0), k: 0, sizes: [] };
  const p = data[0]!.length;

  const clean: number[][] = [];
  const validIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    let hasMissing = false;
    for (let j = 0; j < p; j++) {
      if (data[i]![j] == null || !Number.isFinite(data[i]![j]!)) {
        hasMissing = true;
        break;
      }
    }
    if (!hasMissing) {
      clean.push(data[i]! as number[]);
      validIndices.push(i);
    }
  }

  const assignments = new Int16Array(n).fill(-1);
  if (clean.length === 0) return { assignments, k: 0, sizes: [] };

  const effectiveMax = Math.min(kMax, clean.length);
  let bestK = 1;
  let bestBic = Infinity;
  let bestAssignments: number[] = new Array(clean.length).fill(0);

  for (let k = 1; k <= effectiveMax; k++) {
    try {
      const result = mlKmeans(clean, k, {
        initialization: "kmeans++",
        maxIterations: 100,
        seed: 42,
      });
      const labels = Array.from(result.clusters);
      const bic = computeBIC(clean, labels, k, p);
      if (bic < bestBic) {
        bestBic = bic;
        bestK = k;
        bestAssignments = labels;
      }
    } catch {
      break;
    }
  }

  for (let i = 0; i < validIndices.length; i++) {
    assignments[validIndices[i]!] = bestAssignments[i] ?? 0;
  }

  const sizes: number[] = [];
  for (let g = 0; g < bestK; g++) sizes.push(0);
  for (const a of bestAssignments) {
    if (a >= 0 && a < bestK) sizes[a]!++;
  }

  return { assignments, k: bestK, sizes };
}

function computeBIC(data: number[][], assignments: number[], k: number, p: number): number {
  const n = data.length;
  if (k <= 0 || n <= 0) return Infinity;

  const centroids: number[][] = Array.from({ length: k }, () => new Array(p).fill(0) as number[]);
  const counts: number[] = new Array(k).fill(0) as number[];

  for (let i = 0; i < n; i++) {
    const c = assignments[i] ?? 0;
    if (c >= 0 && c < k) {
      counts[c]!++;
      for (let j = 0; j < p; j++) centroids[c]![j]! += data[i]![j]!;
    }
  }

  for (let c = 0; c < k; c++) {
    if (counts[c]! > 0) {
      for (let j = 0; j < p; j++) centroids[c]![j]! /= counts[c]!;
    }
  }

  let sse = 0;
  for (let i = 0; i < n; i++) {
    const c = assignments[i] ?? 0;
    if (c >= 0 && c < k) {
      for (let j = 0; j < p; j++) {
        const diff = data[i]![j]! - centroids[c]![j]!;
        sse += diff * diff;
      }
    }
  }

  const variance = n > k * p ? sse / (n - k * p) : sse / n;
  const sigma2 = variance > 1e-10 ? variance : 1e-10;

  let logLik = 0;
  for (let c = 0; c < k; c++) {
    if (counts[c]! <= 0) continue;
    const logPc = Math.log(counts[c]! / n);
    logLik += counts[c]! * logPc;
    logLik -= counts[c]! * p * 0.5 * Math.log(2 * Math.PI * sigma2);
    const dist = sseForCluster(data, assignments, c, centroids[c]!);
    logLik -= dist / (2 * sigma2);
  }

  const numParams = k * (p + 1) - 1;
  return -2 * logLik + numParams * Math.log(n);
}

function sseForCluster(data: number[][], assignments: number[], cluster: number, centroid: number[]): number {
  let sse = 0;
  for (let i = 0; i < data.length; i++) {
    if ((assignments[i] ?? 0) !== cluster) continue;
    for (let j = 0; j < centroid.length; j++) {
      const diff = data[i]![j]! - centroid[j]!;
      sse += diff * diff;
    }
  }
  return sse;
}
