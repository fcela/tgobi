import Delaunator from "delaunator";
import { convexHull, type HullPoint } from "@/lib/geometry/convexHull";

export type ScagnosticMeasure =
  | "outlying"
  | "skew"
  | "clumpy"
  | "sparse"
  | "striated"
  | "convex"
  | "skinny"
  | "stringy"
  | "monotonic";

export const SCAGNOSTIC_MEASURES: readonly ScagnosticMeasure[] = [
  "outlying",
  "skew",
  "clumpy",
  "sparse",
  "striated",
  "convex",
  "skinny",
  "stringy",
  "monotonic",
];

export interface ScagnosticScores {
  outlying: number;
  skew: number;
  clumpy: number;
  sparse: number;
  striated: number;
  convex: number;
  skinny: number;
  stringy: number;
  monotonic: number;
}

export interface ScagnosticResult {
  xVar: string;
  yVar: string;
  scores: ScagnosticScores;
}

interface Edge {
  a: number;
  b: number;
  len: number;
}

interface GraphStructures {
  mstEdges: Edge[];
  delEdges: Edge[];
  alphaArea: number;
  totalDelArea: number;
  hullArea: number;
  hullPerimeter: number;
  n: number;
  points: Float64Array;
  mstTotalLen: number;
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a},${b}` : `${b},${a}`;
}

function euclideanDist(points: Float64Array, i: number, j: number): number {
  const dx = points[2 * i]! - points[2 * j]!;
  const dy = points[2 * i + 1]! - points[2 * j + 1]!;
  return Math.sqrt(dx * dx + dy * dy);
}

function triangleArea(
  points: Float64Array,
  i: number,
  j: number,
  k: number,
): number {
  const xi = points[2 * i]!, yi = points[2 * i + 1]!;
  const xj = points[2 * j]!, yj = points[2 * j + 1]!;
  const xk = points[2 * k]!, yk = points[2 * k + 1]!;
  return Math.abs((xj - xi) * (yk - yi) - (xk - xi) * (yj - yi)) / 2;
}

function bitGetSafe(buf: Uint8Array, i: number): boolean {
  const byte = Math.floor(i / 8);
  const bit = i % 8;
  if (byte >= buf.length) return false;
  return (buf[byte]! & (1 << bit)) !== 0;
}

function kruskalMST(n: number, edges: Edge[]): Edge[] {
  const parent = new Int32Array(n);
  const rank = new Uint8Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  }

  function union(a: number, b: number): boolean {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return false;
    if (rank[ra]! < rank[rb]!) parent[ra] = rb;
    else if (rank[ra]! > rank[rb]!) parent[rb] = ra;
    else {
      parent[rb] = ra;
      rank[ra]!++;
    }
    return true;
  }

  const mst: Edge[] = [];
  for (const e of edges) {
    if (union(e.a, e.b)) {
      mst.push(e);
      if (mst.length === n - 1) break;
    }
  }
  return mst;
}

function buildStructures(
  x: Float64Array | Int32Array,
  y: Float64Array | Int32Array,
  xMissing: Uint8Array,
  yMissing: Uint8Array,
): GraphStructures | null {
  const n = x.length;
  const cleanPts: number[] = [];

  for (let i = 0; i < n; i++) {
    if (bitGetSafe(xMissing, i) || bitGetSafe(yMissing, i)) continue;
    const xv = x[i]!, yv = y[i]!;
    if (!Number.isFinite(xv) || !Number.isFinite(yv)) continue;
    cleanPts.push(xv, yv);
  }

  const m = cleanPts.length / 2;
  if (m < 3) return null;

  // Add tiny perturbation for Delaunay stability (collinear/coincident points)
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (let i = 0; i < m; i++) {
    const xv = cleanPts[2 * i]!, yv = cleanPts[2 * i + 1]!;
    if (xv < xMin) xMin = xv;
    if (xv > xMax) xMax = xv;
    if (yv < yMin) yMin = yv;
    if (yv > yMax) yMax = yv;
  }
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;
  const jitter = Math.max(xRange, yRange) * 1e-10;

  const points = new Float64Array(m * 2);
  for (let i = 0; i < m; i++) {
    // Use deterministic hash-based jitter so results are reproducible
    const h = (i * 2654435761) >>> 0;
    const dx = ((h & 0xFFFF) / 0xFFFF - 0.5) * jitter;
    const dy = (((h >>> 16) & 0xFFFF) / 0xFFFF - 0.5) * jitter;
    points[2 * i] = cleanPts[2 * i]! + dx;
    points[2 * i + 1] = cleanPts[2 * i + 1]! + dy;
  }

  // Convex hull
  const hullPoints: HullPoint[] = [];
  for (let i = 0; i < m; i++) {
    hullPoints.push({ x: points[2 * i]!, y: points[2 * i + 1]! });
  }
  const hull = convexHull(hullPoints);
  if (hull.length < 3) return null;

  let hullArea = 0;
  for (let i = 0; i < hull.length; i++) {
    const j = (i + 1) % hull.length;
    hullArea += hull[i]!.x * hull[j]!.y;
    hullArea -= hull[j]!.x * hull[i]!.y;
  }
  hullArea = Math.abs(hullArea) / 2;

  let hullPerimeter = 0;
  for (let i = 0; i < hull.length; i++) {
    const j = (i + 1) % hull.length;
    const dx = hull[j]!.x - hull[i]!.x;
    const dy = hull[j]!.y - hull[i]!.y;
    hullPerimeter += Math.sqrt(dx * dx + dy * dy);
  }

  // Delaunay triangulation
  let delaunay: Delaunator<Float64Array>;
  try {
    const flatCoords = new Float64Array(m * 2);
    flatCoords.set(points);
    delaunay = new Delaunator(flatCoords);
  } catch {
    return null;
  }

  const delEdgeSet = new Set<string>();
  const delEdges: Edge[] = [];
  const triangles = delaunay.triangles;

  let totalDelArea = 0;
  for (let t = 0; t < triangles.length; t += 3) {
    const i = triangles[t]!;
    const j = triangles[t + 1]!;
    const k = triangles[t + 2]!;
    totalDelArea += triangleArea(points, i, j, k);

    const pairs: [number, number][] = [
      [i, j],
      [j, k],
      [k, i],
    ];
    for (const [a, b] of pairs) {
      const key = edgeKey(a, b);
      if (!delEdgeSet.has(key)) {
        delEdgeSet.add(key);
        delEdges.push({
          a,
          b,
          len: euclideanDist(points, a, b),
        });
      }
    }
  }

  delEdges.sort((a, b) => a.len - b.len);

  // MST from Delaunay edges
  const mstEdges = kruskalMST(m, delEdges);
  const mstTotalLen = mstEdges.reduce((s, e) => s + e.len, 0);

  // Alpha shape: keep edges ≤ 90th percentile length, compute area of remaining triangles
  const alphaQuantile = 0.9;
  const edgeLens = delEdges.map((e) => e.len).sort((a, b) => a - b);
  const edgeLenMax =
    edgeLens[Math.min(Math.floor(alphaQuantile * edgeLens.length), edgeLens.length - 1)]!;

  let alphaArea = 0;
  for (let t = 0; t < triangles.length; t += 3) {
    const i = triangles[t]!;
    const j = triangles[t + 1]!;
    const k = triangles[t + 2]!;
    if (
      euclideanDist(points, i, j) <= edgeLenMax &&
      euclideanDist(points, j, k) <= edgeLenMax &&
      euclideanDist(points, k, i) <= edgeLenMax
    ) {
      alphaArea += triangleArea(points, i, j, k);
    }
  }

  return {
    mstEdges,
    delEdges,
    alphaArea,
    totalDelArea,
    hullArea,
    hullPerimeter,
    n: m,
    points,
    mstTotalLen,
  };
}

// --- Nine scagnostic measures ---

function computeOutlying(s: GraphStructures): number {
  if (s.mstEdges.length === 0) return 0;
  const lens = s.mstEdges.map((e) => e.len).sort((a, b) => a - b);
  const q25 = lens[Math.floor(0.25 * lens.length)]!;
  const q75 = lens[Math.floor(0.75 * lens.length)]!;
  const iqr = q75 - q25;
  const fence = q75 + 1.5 * iqr;
  let outlyingLen = 0;
  for (const e of s.mstEdges) {
    if (e.len > fence) outlyingLen += e.len;
  }
  return s.mstTotalLen > 0 ? outlyingLen / s.mstTotalLen : 0;
}

function computeSkew(s: GraphStructures): number {
  if (s.mstEdges.length === 0) return 0;
  const lens = s.mstEdges.map((e) => e.len);
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  if (mean === 0) return 0;
  const variance = lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length;
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  const skewness =
    lens.reduce((a, b) => a + ((b - mean) / std) ** 3, 0) / lens.length;
  return 1 - 1 / (1 + Math.max(0, skewness));
}

/**
 * Clumpy (cluster measure) following Wilkinson et al. 2005:
 *
 * For each MST edge e with weight w:
 * 1. Remove e from MST, splitting into two subtrees
 * 2. From each endpoint, follow MST edges with weight < w (shorter than e),
 *    counting the reachable nodes (runts) and tracking the longest such edge
 * 3. runts = count of the smaller subtree; maxLen = longest edge in that subtree
 * 4. value = runts * (1 - maxLen / w)
 * Overall: clumpy = 2 * max(value) / n
 */
function computeClumpy(s: GraphStructures): number {
  if (s.mstEdges.length === 0) return 0;

  // Build MST adjacency list
  const adj: { neighbor: number; len: number }[][] = Array.from(
    { length: s.n },
    () => [],
  );
  for (const e of s.mstEdges) {
    adj[e.a]!.push({ neighbor: e.b, len: e.len });
    adj[e.b]!.push({ neighbor: e.a, len: e.len });
  }

  let maxValue = 0;

  for (const mstEdge of s.mstEdges) {
    // Get children from each side, only following edges shorter than mstEdge.len
    const visited = new Uint8Array(s.n);

    const count1 = getMSTChildren(
      adj,
      visited,
      mstEdge.a,
      mstEdge.len,
      mstEdge.b,
    );
    const maxLen1 = count1.maxLen;

    const count2 = getMSTChildren(
      adj,
      visited,
      mstEdge.b,
      mstEdge.len,
      mstEdge.a,
    );
    const maxLen2 = count2.maxLen;

    // Runts = smaller subtree
    let runts: number;
    let maxLen: number;
    if (count1.count < count2.count) {
      runts = count1.count;
      maxLen = maxLen1;
    } else if (count1.count === count2.count) {
      runts = count1.count;
      maxLen = Math.min(maxLen1, maxLen2);
    } else {
      runts = count2.count;
      maxLen = maxLen2;
    }

    if (maxLen > 0 && mstEdge.len > 0) {
      const value = runts * (1 - maxLen / mstEdge.len);
      if (value > maxValue) maxValue = value;
    }
  }

  return (2 * maxValue) / s.n;
}

function getMSTChildren(
  adj: { neighbor: number; len: number }[][],
  visited: Uint8Array,
  node: number,
  cutoff: number,
  excludeNode: number,
): { count: number; maxLen: number } {
  visited[node] = 1;
  let count = 1; // count this node
  let maxLen = 0;

  for (const edge of adj[node]!) {
    if (edge.neighbor === excludeNode && edge.len === cutoff) continue; // skip the removed edge
    if (visited[edge.neighbor]) continue;
    if (edge.len >= cutoff) continue; // only follow edges shorter than cutoff
    const child = getMSTChildren(adj, visited, edge.neighbor, cutoff, -1);
    count += child.count;
    if (child.maxLen > maxLen) maxLen = child.maxLen;
    if (edge.len > maxLen) maxLen = edge.len;
  }

  return { count, maxLen };
}

function computeSparse(s: GraphStructures): number {
  if (s.hullArea === 0 || s.n === 0) return 0;
  // Sparse is based on the ratio of MST total length to the "expected" length
  // for a uniform distribution in the same area.
  // Following Wilkinson: sparse = 1 - exp(-mean MST edge length * sqrt(n / area))
  const meanMstLen = s.mstTotalLen / Math.max(1, s.mstEdges.length);
  const density = s.n / s.hullArea;
  const x = meanMstLen * Math.sqrt(density);
  return 1 - 1 / (1 + x);
}

function computeStriated(s: GraphStructures): number {
  if (s.mstEdges.length < 2) return 0;

  // Build MST adjacency
  const mstEdgeMap = new Map<string, Edge>();
  for (const e of s.mstEdges) {
    mstEdgeMap.set(edgeKey(e.a, e.b), e);
  }

  const adj: [number, Edge][][] = Array.from({ length: s.n }, () => []);
  for (const e of s.mstEdges) {
    adj[e.a]!.push([e.b, e]);
    adj[e.b]!.push([e.a, e]);
  }

  let parallelCount = 0;
  let totalChecked = 0;

  for (const e of s.mstEdges) {
    // Neighbors of a (excluding b) and neighbors of b (excluding a)
    const nbrsA = adj[e.a]!.filter(([nbr]) => nbr !== e.b);
    const nbrsB = adj[e.b]!.filter(([nbr]) => nbr !== e.a);

    for (const [, eA] of nbrsA) {
      for (const [, eB] of nbrsB) {
        totalChecked++;
        const cos = cosineBetweenEdges(s.points, e, eA, eB);
        // Parallel = cosine < -0.75 (angle > 150°)
        if (cos < -0.75) parallelCount++;
      }
    }
  }

  if (totalChecked === 0) return 0;
  return clamp01(parallelCount / totalChecked);
}

/**
 * For MST edge e, with adjacent edges eA (at e.a) and eB (at e.b):
 * e goes from e.a → e.b, eA goes from e.a → eA.other, eB goes from e.b → eB.other
 * Parallel if eA and eB point in roughly opposite directions along e.
 */
function cosineBetweenEdges(
  points: Float64Array,
  e: Edge,
  eA: Edge,
  eB: Edge,
): number {
  // Direction of e: a → b
  const ex = points[2 * e.b]! - points[2 * e.a]!;
  const ey = points[2 * e.b + 1]! - points[2 * e.a + 1]!;

  // Direction of eA from a
  const otherA = eA.a === e.a ? eA.b : eA.a;
  const ax = points[2 * otherA]! - points[2 * e.a]!;
  const ay = points[2 * otherA + 1]! - points[2 * e.a + 1]!;

  // Direction of eB from b
  const otherB = eB.a === e.b ? eB.b : eB.a;
  const bx = points[2 * otherB]! - points[2 * e.b]!;
  const by = points[2 * otherB + 1]! - points[2 * e.b + 1]!;

  // Project eA and eB onto the direction of e
  // eA component along e
  const eLen = Math.sqrt(ex * ex + ey * ey);
  if (eLen === 0) return 0;
  const eux = ex / eLen,
    euy = ey / eLen;

  const projA = ax * eux + ay * euy;
  const projB = bx * eux + by * euy;

  // Striated: eA points away from e (projA < 0) and eB points away from e (projB > 0)
  // This means the edges continue in the same direction as e
  // Actually, Wilkinson: angle between e and eA near 0 AND angle between e and eB near 0
  // (both edges continue in the same direction) → NOT striated
  // Striated: angle between e and eA near 180° AND angle between e and eB near 180°
  // (both edges go back) — this means the MST continues in a line
  // Wait, striated means the point cloud has parallel lines/stripes
  // MST edges in a striated pattern form parallel paths
  // The measure: at each internal MST node, if adjacent edges form an angle near 0 or 180

  // Use direct angle between eA direction and eB direction (projected)
  const cosAngle = (ax * bx + ay * by) / Math.sqrt(
    (ax * ax + ay * ay) * (bx * bx + by * by) + 1e-30,
  );
  return cosAngle;
}

function computeConvex(s: GraphStructures): number {
  if (s.totalDelArea === 0) return 0;
  return clamp01(s.alphaArea / s.totalDelArea);
}

function computeSkinny(s: GraphStructures): number {
  if (s.hullArea === 0 || s.hullPerimeter === 0) return 0;
  const isoperimetric = (4 * Math.PI * s.hullArea) / (s.hullPerimeter ** 2);
  return 1 - isoperimetric;
}

function computeStringy(s: GraphStructures): number {
  if (s.mstEdges.length === 0 || s.n < 3) return 0;
  const degrees = new Uint16Array(s.n);
  for (const e of s.mstEdges) {
    degrees[e.a]!++;
    degrees[e.b]!++;
  }
  let degree3Plus = 0;
  for (let i = 0; i < s.n; i++) {
    if (degrees[i]! >= 3) degree3Plus++;
  }
  return clamp01(1 - degree3Plus / (s.n - 2));
}

function computeMonotonic(
  x: Float64Array | Int32Array,
  y: Float64Array | Int32Array,
  xMissing: Uint8Array,
  yMissing: Uint8Array,
): number {
  const n = x.length;
  const cleanX: number[] = [];
  const cleanY: number[] = [];
  for (let i = 0; i < n; i++) {
    if (bitGetSafe(xMissing, i) || bitGetSafe(yMissing, i)) continue;
    if (!Number.isFinite(x[i]!) || !Number.isFinite(y[i]!)) continue;
    cleanX.push(x[i]!);
    cleanY.push(y[i]!);
  }
  if (cleanX.length < 3) return 0;
  const r = spearmanCorrelation(cleanX, cleanY);
  return Math.abs(r);
}

function spearmanCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  const rx = rankArray(x);
  const ry = rankArray(y);
  const meanR = (n + 1) / 2;
  let num = 0,
    denX = 0,
    denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = rx[i]! - meanR;
    const dy = ry[i]! - meanR;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX === 0 || denY === 0) return 0;
  return num / Math.sqrt(denX * denY);
}

function rankArray(values: number[]): number[] {
  const n = values.length;
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(n);
  let j = 0;
  while (j < n) {
    let k = j;
    while (k < n - 1 && indexed[k + 1]!.v === indexed[k]!.v) k++;
    const avgRank = (j + k) / 2 + 1;
    for (let t = j; t <= k; t++) ranks[indexed[t]!.i] = avgRank;
    j = k + 1;
  }
  return ranks;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function computeScagnostics(
  x: Float64Array | Int32Array,
  y: Float64Array | Int32Array,
  xMissing: Uint8Array,
  yMissing: Uint8Array,
): ScagnosticScores {
  const s = buildStructures(x, y, xMissing, yMissing);
  if (!s) return emptyScores();

  return {
    outlying: clamp01(computeOutlying(s)),
    skew: clamp01(computeSkew(s)),
    clumpy: clamp01(computeClumpy(s)),
    sparse: clamp01(computeSparse(s)),
    striated: clamp01(computeStriated(s)),
    convex: clamp01(computeConvex(s)),
    skinny: clamp01(computeSkinny(s)),
    stringy: clamp01(computeStringy(s)),
    monotonic: clamp01(computeMonotonic(x, y, xMissing, yMissing)),
  };
}

function emptyScores(): ScagnosticScores {
  return {
    outlying: 0,
    skew: 0,
    clumpy: 0,
    sparse: 0,
    striated: 0,
    convex: 0,
    skinny: 0,
    stringy: 0,
    monotonic: 0,
  };
}

export function computeAllPairs(
  df: {
    nrow: number;
    columns: ReadonlyArray<{
      name: string;
      type: string;
      values?: Float64Array | Int32Array;
      codes?: Int32Array;
      missing: { buffer: Uint8Array };
    }>;
  },
  variables: string[],
): ScagnosticResult[] {
  const results: ScagnosticResult[] = [];
  const cols = new Map<
    string,
    { values: Float64Array | Int32Array; missing: Uint8Array }
  >();

  for (const v of variables) {
    const c = df.columns.find((col) => col.name === v);
    if (c && (c.type === "numeric" || c.type === "integer") && c.values) {
      cols.set(v, { values: c.values, missing: c.missing.buffer });
    }
  }

  for (let i = 0; i < variables.length; i++) {
    for (let j = i + 1; j < variables.length; j++) {
      const xVar = variables[i]!;
      const yVar = variables[j]!;
      const xCol = cols.get(xVar);
      const yCol = cols.get(yVar);
      if (!xCol || !yCol) continue;

      const scores = computeScagnostics(
        xCol.values,
        yCol.values,
        xCol.missing,
        yCol.missing,
      );
      results.push({ xVar, yVar, scores });
    }
  }
  return results;
}
