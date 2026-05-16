import { OPTICS } from "density-clustering";
import type { ClusterResult } from "./types";

export interface OpticsResult extends ClusterResult {
  ordering: Int32Array;
  reachability: Float64Array;
}

export function optics(
  data: (number | null)[][],
  eps: number,
  minPts: number,
  xi: number,
): OpticsResult {
  const n = data.length;
  if (n === 0) return { assignments: new Int16Array(0), k: 0, sizes: [], ordering: new Int32Array(0), reachability: new Float64Array(0) };
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
  if (validIndices.length === 0) return { assignments, k: 0, sizes: [], ordering: new Int32Array(0), reachability: new Float64Array(0) };

  const clean = validIndices.map((i) => data[i]! as number[]);
  const solver = new OPTICS();
  solver.run(clean, eps, minPts);

  const reachPlot = (solver as any).getReachabilityPlot() as Array<[number, number | undefined]>;
  const m = reachPlot.length;

  const ordering = new Int32Array(m);
  const reachability = new Float64Array(n);
  reachability.fill(Infinity);

  for (let i = 0; i < m; i++) {
    const [localIdx, dist] = reachPlot[i]!;
    const globalIdx = validIndices[localIdx] ?? -1;
    ordering[i] = globalIdx;
    if (dist != null && Number.isFinite(dist)) {
      reachability[globalIdx] = dist;
    }
  }

  const reach = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    const d = reachPlot[i]![1];
    reach[i] = d != null && Number.isFinite(d) ? d : Infinity;
  }

  const clusterRanges = xiCluster(reach, xi);

  let clusterId = 0;
  const sizes: number[] = [];
  for (const [start, end] of clusterRanges) {
    const members = new Set<number>();
    for (let i = start; i <= end; i++) {
      const localIdx = reachPlot[i]![0]!;
      const globalIdx = validIndices[localIdx]!;
      if (assignments[globalIdx]! < 0) {
        assignments[globalIdx] = clusterId;
        members.add(globalIdx);
      }
    }
    if (members.size > 0) {
      sizes.push(members.size);
      clusterId++;
    }
  }

  return { assignments, k: sizes.length, sizes, ordering, reachability };
}

function xiCluster(reach: Float64Array, xi: number): Array<[number, number]> {
  const m = reach.length;
  if (m < 2) return [];

  const finiteMax = Math.max(1e-10, ...Array.from(reach).filter((v) => Number.isFinite(v)));
  const hasInf = reach.some((v) => !Number.isFinite(v));

  if (hasInf) {
    return infinityGapExtract(reach);
  }

  return xiSteepExtract(reach, xi, finiteMax);
}

function infinityGapExtract(reach: Float64Array): Array<[number, number]> {
  const m = reach.length;
  const clusters: Array<[number, number]> = [];
  let segStart = 0;

  for (let i = 0; i < m; i++) {
    if (!Number.isFinite(reach[i]!) && i > 0 && Number.isFinite(reach[i - 1]!)) {
      clusters.push([segStart, i - 1]);
      segStart = -1;
    } else if (!Number.isFinite(reach[i]!) && segStart < 0) {
      segStart = i;
    } else if (Number.isFinite(reach[i]!) && segStart < 0) {
      segStart = i;
    }
  }
  if (segStart >= 0) clusters.push([segStart, m - 1]);

  const merged: Array<[number, number]> = [];
  for (const [s, e] of clusters) {
    if (merged.length > 0) {
      const prev = merged[merged.length - 1]!;
      if (s === prev[1] + 1) {
        prev[1] = e;
        continue;
      }
    }
    merged.push([s, e]);
  }

  return merged.filter(([, e]) => e >= 0);
}

function xiSteepExtract(reach: Float64Array, xi: number, maxReach: number): Array<[number, number]> {
  const m = reach.length;
  const xiAbs = xi * maxReach;

  interface SteepRegion { kind: "down" | "up"; start: number; end: number; }
  const steeps: SteepRegion[] = [];

  let i = 0;
  while (i < m - 1) {
    if (!Number.isFinite(reach[i]!)) { i++; continue; }
    if (!Number.isFinite(reach[i + 1]!)) { i += 2; continue; }

    const diff = reach[i]! - reach[i + 1]!;

    if (diff >= xiAbs) {
      const start = i;
      let end = i;
      while (end < m - 1
        && Number.isFinite(reach[end + 1]!)
        && reach[end]! - reach[end + 1]! >= 0
      ) {
        end++;
      }
      if (end > start) steeps.push({ kind: "down", start, end });
      i = end + 1;
    } else if (-diff >= xiAbs) {
      const start = i;
      let end = i;
      while (end < m - 1
        && Number.isFinite(reach[end + 1]!)
        && reach[end + 1]! - reach[end]! >= 0
      ) {
        end++;
      }
      if (end > start) steeps.push({ kind: "up", start, end });
      i = end + 1;
    } else {
      i++;
    }
  }

  const clusters: Array<[number, number]> = [];
  for (let si = 0; si < steeps.length; si++) {
    const s = steeps[si]!;
    if (s.kind !== "down") continue;

    for (let sj = si + 1; sj < steeps.length; sj++) {
      const e = steeps[sj]!;
      if (e.kind !== "up") continue;

      if (e.start - s.end > m * 0.5) break;

      const startIdx = s.start;
      const endIdx = e.end;
      if (endIdx <= startIdx) continue;

      let maxInside = -Infinity;
      for (let k = s.end + 1; k < e.start; k++) {
        if (Number.isFinite(reach[k]!) && reach[k]! > maxInside) maxInside = reach[k]!;
      }
      const downMax = reach[s.start]!;
      const upMax = reach[e.end]!;
      const threshold = Math.max(downMax, upMax) - xiAbs;
      if (maxInside > threshold) continue;

      clusters.push([startIdx, endIdx]);
      break;
    }
  }

  if (clusters.length === 0 && steeps.length === 0) {
    return [[0, m - 1]];
  }

  return clusters;
}
