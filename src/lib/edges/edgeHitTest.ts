import {
  bitGet,
  bitSet,
  pointInPolygon,
  type Point2D,
  type RectQuery,
} from "@/lib/brush/hitTest";
import type { Edges } from "@/lib/edges/types";

export type EdgeBrushQuery =
  | { tool: "rectangle"; rect: RectQuery }
  | { tool: "ellipse"; rect: RectQuery }
  | { tool: "lasso"; path: ReadonlyArray<Point2D> };

export function edgesFromNodeMask(
  edges: Edges,
  nodeMask: Uint8Array,
): Uint8Array {
  const n = edges.source.length;
  const out = new Uint8Array(Math.ceil(n / 8));
  for (let e = 0; e < n; e++) {
    const a = edges.source[e]!;
    const b = edges.target[e]!;
    if (a < 0 || b < 0) continue;
    if (bitGet(nodeMask, a) || bitGet(nodeMask, b)) {
      bitSet(out, e);
    }
  }
  return out;
}

export function nodesFromEdgeMask(
  edges: Edges,
  edgeMask: Uint8Array,
  nNodes: number,
): Uint8Array {
  const out = new Uint8Array(Math.ceil(nNodes / 8));
  for (let e = 0; e < edges.source.length; e++) {
    if (!bitGet(edgeMask, e)) continue;
    const a = edges.source[e]!;
    const b = edges.target[e]!;
    if (a >= 0 && a < nNodes) bitSet(out, a);
    if (b >= 0 && b < nNodes) bitSet(out, b);
  }
  return out;
}

export function edgesInBrush(
  edges: Edges,
  xy: Float64Array,
  query: EdgeBrushQuery,
  excludedNodes?: Uint8Array,
): Uint8Array {
  const nEdges = edges.source.length;
  const nNodes = xy.length / 2;
  const out = new Uint8Array(Math.ceil(nEdges / 8));
  if (query.tool === "lasso" && query.path.length < 3) return out;

  for (let e = 0; e < nEdges; e++) {
    const a = edges.source[e]!;
    const b = edges.target[e]!;
    if (a < 0 || b < 0 || a >= nNodes || b >= nNodes) continue;
    if (excludedNodes && (bitGet(excludedNodes, a) || bitGet(excludedNodes, b))) continue;
    const ax = xy[2 * a]!;
    const ay = xy[2 * a + 1]!;
    const bx = xy[2 * b]!;
    const by = xy[2 * b + 1]!;
    if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(bx) || !Number.isFinite(by)) continue;

    const hit =
      query.tool === "rectangle"
        ? segmentIntersectsRect(ax, ay, bx, by, query.rect)
        : query.tool === "ellipse"
          ? segmentIntersectsEllipse(ax, ay, bx, by, query.rect)
          : segmentIntersectsPolygon(ax, ay, bx, by, query.path);
    if (hit) bitSet(out, e);
  }
  return out;
}

export function unionMasks(a: Uint8Array, b: Uint8Array): Uint8Array {
  const n = Math.max(a.length, b.length);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (a[i] ?? 0) | (b[i] ?? 0);
  return out;
}

export function nearestEdge(
  edges: Edges,
  xy: Float64Array,
  point: Point2D,
  maxDistance = Infinity,
  excludedNodes?: Uint8Array,
): { index: number; distance: number } | null {
  const nNodes = xy.length / 2;
  let bestIndex = -1;
  let bestDistance = maxDistance;
  for (let e = 0; e < edges.source.length; e++) {
    const a = edges.source[e]!;
    const b = edges.target[e]!;
    if (a < 0 || b < 0 || a >= nNodes || b >= nNodes) continue;
    if (excludedNodes && (bitGet(excludedNodes, a) || bitGet(excludedNodes, b))) continue;
    const ax = xy[2 * a]!;
    const ay = xy[2 * a + 1]!;
    const bx = xy[2 * b]!;
    const by = xy[2 * b + 1]!;
    if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(bx) || !Number.isFinite(by)) continue;
    const distance = pointSegmentDistance(point.x, point.y, ax, ay, bx, by);
    if (distance <= bestDistance) {
      bestDistance = distance;
      bestIndex = e;
    }
  }
  return bestIndex >= 0 ? { index: bestIndex, distance: bestDistance } : null;
}

function segmentIntersectsRect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  rect: RectQuery,
): boolean {
  const x0 = Math.min(rect.x0, rect.x1);
  const y0 = Math.min(rect.y0, rect.y1);
  const x1 = Math.max(rect.x0, rect.x1);
  const y1 = Math.max(rect.y0, rect.y1);
  if (pointInRect(ax, ay, x0, y0, x1, y1) || pointInRect(bx, by, x0, y0, x1, y1)) return true;
  return (
    segmentsIntersect(ax, ay, bx, by, x0, y0, x1, y0) ||
    segmentsIntersect(ax, ay, bx, by, x1, y0, x1, y1) ||
    segmentsIntersect(ax, ay, bx, by, x1, y1, x0, y1) ||
    segmentsIntersect(ax, ay, bx, by, x0, y1, x0, y0)
  );
}

function segmentIntersectsEllipse(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  rect: RectQuery,
): boolean {
  const x0 = Math.min(rect.x0, rect.x1);
  const y0 = Math.min(rect.y0, rect.y1);
  const x1 = Math.max(rect.x0, rect.x1);
  const y1 = Math.max(rect.y0, rect.y1);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rx = Math.max(1e-9, (x1 - x0) / 2);
  const ry = Math.max(1e-9, (y1 - y0) / 2);
  const xA = (ax - cx) / rx;
  const yA = (ay - cy) / ry;
  const xB = (bx - cx) / rx;
  const yB = (by - cy) / ry;
  if (xA * xA + yA * yA <= 1 || xB * xB + yB * yB <= 1) return true;

  const dx = xB - xA;
  const dy = yB - yA;
  const qa = dx * dx + dy * dy;
  const qb = 2 * (xA * dx + yA * dy);
  const qc = xA * xA + yA * yA - 1;
  const disc = qb * qb - 4 * qa * qc;
  if (disc < 0 || qa <= 1e-12) return false;
  const root = Math.sqrt(disc);
  const t0 = (-qb - root) / (2 * qa);
  const t1 = (-qb + root) / (2 * qa);
  return (t0 >= 0 && t0 <= 1) || (t1 >= 0 && t1 <= 1);
}

function segmentIntersectsPolygon(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  polygon: ReadonlyArray<Point2D>,
): boolean {
  if (pointInPolygon(ax, ay, polygon) || pointInPolygon(bx, by, polygon)) return true;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const p0 = polygon[j]!;
    const p1 = polygon[i]!;
    if (segmentsIntersect(ax, ay, bx, by, p0.x, p0.y, p1.x, p1.y)) return true;
  }
  return false;
}

function pointInRect(x: number, y: number, x0: number, y0: number, x1: number, y1: number): boolean {
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function pointSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 <= 1e-12) {
    const x = px - ax;
    const y = py - ay;
    return Math.sqrt(x * x + y * y);
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const x = ax + t * dx;
  const y = ay + t * dy;
  const ddx = px - x;
  const ddy = py - y;
  return Math.sqrt(ddx * ddx + ddy * ddy);
}

function segmentsIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  const o1 = orient(ax, ay, bx, by, cx, cy);
  const o2 = orient(ax, ay, bx, by, dx, dy);
  const o3 = orient(cx, cy, dx, dy, ax, ay);
  const o4 = orient(cx, cy, dx, dy, bx, by);
  if (o1 === 0 && onSegment(ax, ay, cx, cy, bx, by)) return true;
  if (o2 === 0 && onSegment(ax, ay, dx, dy, bx, by)) return true;
  if (o3 === 0 && onSegment(cx, cy, ax, ay, dx, dy)) return true;
  if (o4 === 0 && onSegment(cx, cy, bx, by, dx, dy)) return true;
  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}

function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  const v = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  return Math.abs(v) < 1e-9 ? 0 : v;
}

function onSegment(ax: number, ay: number, px: number, py: number, bx: number, by: number): boolean {
  return (
    px >= Math.min(ax, bx) - 1e-9 &&
    px <= Math.max(ax, bx) + 1e-9 &&
    py >= Math.min(ay, by) - 1e-9 &&
    py <= Math.max(ay, by) + 1e-9
  );
}
