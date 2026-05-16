export interface MapperNode {
  id: number;
  rows: number[];
  level: number;
  intervalIndex: number;
  clusterIndex: number;
  x: number;
  y: number;
  stats: Record<string, number>;
}

export interface MapperEdge {
  source: number;
  target: number;
  sharedRows: number;
}

export interface MapperGraph {
  nodes: MapperNode[];
  edges: MapperEdge[];
  intervals: number;
  overlap: number;
  nClusters: number[];
}

export type FilterFunction = "variable" | "pca1" | "pca2" | "density" | "eccentricity" | "residual";

export interface MapperParams {
  filter: FilterFunction;
  filterVar: string | null;
  intervals: number;
  overlap: number;
  clusterK: number;
  variables: string[];
}

const DEFAULT_MAPPER_PARAMS: MapperParams = {
  filter: "variable",
  filterVar: null,
  intervals: 10,
  overlap: 0.5,
  clusterK: 3,
  variables: [],
};

export { DEFAULT_MAPPER_PARAMS };

export function computeMapper(
  values: Float64Array,
  missing: Uint8Array,
  nRows: number,
  dataCols: Array<{ values: Float64Array | Int32Array; missing: Uint8Array; name: string }>,
  params: MapperParams,
): MapperGraph {
  const validRows: number[] = [];
  const validValues: number[] = [];
  for (let i = 0; i < nRows; i++) {
    if (bitGet(missing, i)) continue;
    if (!isFinite(values[i]!)) continue;
    validRows.push(i);
    validValues.push(values[i]!);
  }

  if (validRows.length === 0) return { nodes: [], edges: [], intervals: params.intervals, overlap: params.overlap, nClusters: [] };

  const fMin = Math.min(...validValues);
  const fMax = Math.max(...validValues);
  if (fMin === fMax) return { nodes: [], edges: [], intervals: params.intervals, overlap: params.overlap, nClusters: [] };

  const { intervals, overlap, clusterK } = params;
  const step = (fMax - fMin) / intervals;
  const overlapSize = step * overlap;
  const nClusters: number[] = [];
  const intervalClusters: Array<{ level: number; intervalIdx: number; clusterIdx: number; rows: number[] }> = [];

  for (let i = 0; i < intervals; i++) {
    const lo = fMin + i * step - overlapSize / 2;
    const hi = fMin + (i + 1) * step + overlapSize / 2;

    const intervalRows: number[] = [];
    for (let j = 0; j < validRows.length; j++) {
      const v = validValues[j]!;
      if (v >= lo && v <= hi) intervalRows.push(validRows[j]!);
    }

    if (intervalRows.length === 0) {
      nClusters.push(0);
      continue;
    }

    const clusters = simpleKMeans(intervalRows, dataCols, clusterK);
    nClusters.push(clusters.length);

    for (let ci = 0; ci < clusters.length; ci++) {
      intervalClusters.push({
        level: i,
        intervalIdx: i,
        clusterIdx: ci,
        rows: clusters[ci]!,
      });
    }
  }

  const nodes: MapperNode[] = intervalClusters.map((ic, id) => {
    const stats: Record<string, number> = {};
    for (const col of dataCols) {
      let sum = 0;
      let sumSq = 0;
      let count = 0;
      let lo = Infinity;
      let hi = -Infinity;
      for (const row of ic.rows) {
        if (bitGet(col.missing, row)) continue;
        const v = col.values[row]!;
        sum += v;
        sumSq += v * v;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
        count++;
      }
      stats[col.name] = count > 0 ? sum / count : 0;
      stats[`_sd_${col.name}`] = count > 1
        ? Math.sqrt((sumSq - sum * sum / count) / (count - 1))
        : 0;
      stats[`_min_${col.name}`] = count > 0 ? lo : 0;
      stats[`_max_${col.name}`] = count > 0 ? hi : 0;
    }
    stats["_count"] = ic.rows.length;

    const angleStep = (2 * Math.PI) / Math.max(1, intervals);
    const baseAngle = ic.intervalIdx * angleStep - Math.PI / 2;
    const radius = 60 + ic.clusterIdx * 40;
    const x = Math.cos(baseAngle) * radius;
    const y = Math.sin(baseAngle) * radius;

    return {
      id,
      rows: ic.rows,
      level: ic.level,
      intervalIndex: ic.intervalIdx,
      clusterIndex: ic.clusterIdx,
      x,
      y,
      stats,
    };
  });

  const rowToNodes = new Map<number, number[]>();
  for (const node of nodes) {
    for (const row of node.rows) {
      const list = rowToNodes.get(row) ?? [];
      list.push(node.id);
      rowToNodes.set(row, list);
    }
  }

  const edgeSet = new Set<string>();
  const edges: MapperEdge[] = [];
  for (const [, nodeIds] of rowToNodes) {
    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const a = Math.min(nodeIds[i]!, nodeIds[j]!);
        const b = Math.max(nodeIds[i]!, nodeIds[j]!);
        const key = `${a}-${b}`;
        if (edgeSet.has(key)) continue;
        edgeSet.add(key);

        const nodeA = nodes[a]!;
        const nodeB = nodes[b]!;
        const setA = new Set(nodeA.rows);
        const shared = nodeB.rows.filter((r) => setA.has(r)).length;

        edges.push({ source: a, target: b, sharedRows: shared });
      }
    }
  }

  forceLayout(nodes, edges);

  return { nodes, edges, intervals, overlap, nClusters };
}

function simpleKMeans(
  rows: number[],
  cols: Array<{ values: Float64Array | Int32Array; missing: Uint8Array; name: string }>,
  k: number,
): number[][] {
  if (rows.length <= k) return rows.map((r) => [r]);

  const n = rows.length;
  const p = cols.length;
  const data: number[][] = [];
  for (let i = 0; i < n; i++) {
    const point: number[] = [];
    let hasMissing = false;
    for (let j = 0; j < p; j++) {
      if (bitGet(cols[j]!.missing, rows[i]!)) { hasMissing = true; break; }
      point.push(cols[j]!.values[rows[i]!]!);
    }
    if (hasMissing) { data.push(Array(p).fill(0)); continue; }
    data.push(point);
  }

  const centers: number[][] = [];
  const usedRows = new Set<number>();
  for (let c = 0; c < k; c++) {
    let idx: number;
    if (c === 0) idx = 0;
    else {
      let maxDist = -1;
      idx = 0;
      for (let i = 0; i < n; i++) {
        if (usedRows.has(i)) continue;
        let minD = Infinity;
        for (const center of centers) {
          const d = dist2(data[i]!, center);
          if (d < minD) minD = d;
        }
        if (minD > maxDist) { maxDist = minD; idx = i; }
      }
    }
    centers.push([...data[idx]!]);
    usedRows.add(idx);
  }

  const assignments = new Int32Array(n);
  for (let iter = 0; iter < 20; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let bestC = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = dist2(data[i]!, centers[c]!);
        if (d < bestD) { bestD = d; bestC = c; }
      }
      if (assignments[i] !== bestC) { assignments[i] = bestC; changed = true; }
    }
    if (!changed && iter > 0) break;

    for (let c = 0; c < k; c++) {
      const sum = Array(p).fill(0);
      let count = 0;
      for (let i = 0; i < n; i++) {
        if (assignments[i] === c) {
          for (let j = 0; j < p; j++) sum[j]! += data[i]![j]!;
          count++;
        }
      }
      if (count > 0) {
        for (let j = 0; j < p; j++) centers[c]![j] = sum[j]! / count;
      }
    }
  }

  const clusters: number[][] = Array.from({ length: k }, () => []);
  for (let i = 0; i < n; i++) {
    clusters[assignments[i]!]!.push(rows[i]!);
  }

  return clusters.filter((c) => c.length > 0);
}

function dist2(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!;
    s += d * d;
  }
  return s;
}

function forceLayout(nodes: MapperNode[], edges: MapperEdge[]): void {
  if (nodes.length === 0) return;

  const cx = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
  const cy = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;
  for (const node of nodes) {
    node.x -= cx;
    node.y -= cy;
  }

  const nIter = 50;
  const repulsion = 800;
  const attraction = 0.01;
  const damping = 0.9;

  const vx = new Float64Array(nodes.length);
  const vy = new Float64Array(nodes.length);

  for (let iter = 0; iter < nIter; iter++) {
    const temp = 1 - iter / nIter;

    for (let i = 0; i < nodes.length; i++) {
      let fx = 0;
      let fy = 0;
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const dx = nodes[i]!.x - nodes[j]!.x;
        const dy = nodes[i]!.y - nodes[j]!.y;
        const d2 = Math.max(1, dx * dx + dy * dy);
        const f = repulsion / d2;
        fx += (dx / Math.sqrt(d2)) * f;
        fy += (dy / Math.sqrt(d2)) * f;
      }

      vx[i] = (vx[i]! + fx) * damping * temp;
      vy[i] = (vy[i]! + fy) * damping * temp;
    }

    for (const edge of edges) {
      const si = edge.source;
      const ti = edge.target;
      const dx = nodes[ti]!.x - nodes[si]!.x;
      const dy = nodes[ti]!.y - nodes[si]!.y;
      const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const f = attraction * d * edge.sharedRows;
      vx[si]! += (dx / d) * f * temp;
      vy[si]! += (dy / d) * f * temp;
      vx[ti]! -= (dx / d) * f * temp;
      vy[ti]! -= (dy / d) * f * temp;
    }

    for (let i = 0; i < nodes.length; i++) {
      nodes[i]!.x += vx[i]!;
      nodes[i]!.y += vy[i]!;
    }
  }
}

function bitGet(buf: Uint8Array, i: number): number {
  return (buf[i >> 3]! >>> (i & 7)) & 1;
}
