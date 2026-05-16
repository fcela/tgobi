import type { MapperGraph, MapperParams } from "./index";
import { computeMapper } from "./index";

export interface SweepResult {
  intervals: number;
  overlap: number;
  nNodes: number;
  nEdges: number;
  nComponents: number;
  avgDegree: number;
  modularity: number;
}

export function mapperSweep(
  values: Float64Array,
  missing: Uint8Array,
  nRows: number,
  dataCols: Array<{ values: Float64Array | Int32Array; missing: Uint8Array; name: string }>,
  baseParams: MapperParams,
  intervalRange: number[] = [5, 8, 10, 15, 20],
  overlapRange: number[] = [0.1, 0.3, 0.5, 0.7, 0.9],
): SweepResult[] {
  const results: SweepResult[] = [];

  for (const intervals of intervalRange) {
    for (const overlap of overlapRange) {
      const params: MapperParams = {
        ...baseParams,
        intervals,
        overlap,
      };
      const graph = computeMapper(values, missing, nRows, dataCols, params);
      results.push({
        intervals,
        overlap,
        nNodes: graph.nodes.length,
        nEdges: graph.edges.length,
        nComponents: countComponents(graph),
        avgDegree: graph.nodes.length > 0
          ? (2 * graph.edges.length) / graph.nodes.length
          : 0,
        modularity: computeModularity(graph),
      });
    }
  }

  return results;
}

function countComponents(graph: MapperGraph): number {
  if (graph.nodes.length === 0) return 0;

  const parent = new Int32Array(graph.nodes.length);
  for (let i = 0; i < parent.length; i++) parent[i] = i;

  function find(x: number): number {
    while (parent[x]! !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  }

  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  for (const edge of graph.edges) {
    union(edge.source, edge.target);
  }

  const roots = new Set<number>();
  for (let i = 0; i < graph.nodes.length; i++) {
    roots.add(find(i));
  }
  return roots.size;
}

function computeModularity(graph: MapperGraph): number {
  const n = graph.nodes.length;
  if (n === 0 || graph.edges.length === 0) return 0;

  const degree = new Float64Array(n);
  let m = 0;
  for (const edge of graph.edges) {
    degree[edge.source]! += edge.sharedRows;
    degree[edge.target]! += edge.sharedRows;
    m += edge.sharedRows;
  }
  if (m === 0) return 0;
  const m2 = 2 * m;

  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;

  function find(x: number): number {
    while (parent[x]! !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  }

  for (const edge of graph.edges) {
    const ra = find(edge.source);
    const rb = find(edge.target);
    if (ra !== rb) parent[ra] = rb;
  }

  const communityInternal: Map<number, number> = new Map();
  const communityDegree: Map<number, number> = new Map();

  for (const edge of graph.edges) {
    const ra = find(edge.source);
    const rb = find(edge.target);
    if (ra === rb) {
      communityInternal.set(ra, (communityInternal.get(ra) ?? 0) + edge.sharedRows);
    }
  }

  for (let i = 0; i < n; i++) {
    const ri = find(i);
    communityDegree.set(ri, (communityDegree.get(ri) ?? 0) + degree[i]!);
  }

  let Q = 0;
  for (const [comm, internal] of communityInternal) {
    const deg = communityDegree.get(comm) ?? 0;
    Q += internal / m - (deg / m2) * (deg / m2);
  }

  return Q;
}
