import type { KdTree2D } from "@/lib/brush/kdtree";

export interface RectQuery {
  x0: number; y0: number; x1: number; y1: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export function pointsInRect(tree: KdTree2D, rect: RectQuery): Int32Array {
  const out: number[] = [];
  for (const i of tree.range(rect.x0, rect.y0, rect.x1, rect.y1)) out.push(i);
  out.sort((a, b) => a - b);
  return Int32Array.from(out);
}

export function pointsInEllipse(tree: KdTree2D, rect: RectQuery): Int32Array {
  const x0 = Math.min(rect.x0, rect.x1);
  const y0 = Math.min(rect.y0, rect.y1);
  const x1 = Math.max(rect.x0, rect.x1);
  const y1 = Math.max(rect.y0, rect.y1);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rx = Math.max(1e-9, (x1 - x0) / 2);
  const ry = Math.max(1e-9, (y1 - y0) / 2);
  const out: number[] = [];
  for (const i of tree.range(x0, y0, x1, y1)) {
    const p = tree.point(i);
    const dx = (p.x - cx) / rx;
    const dy = (p.y - cy) / ry;
    if (dx * dx + dy * dy <= 1) out.push(i);
  }
  out.sort((a, b) => a - b);
  return Int32Array.from(out);
}

export function pointsInPolygon(tree: KdTree2D, polygon: ReadonlyArray<Point2D>): Int32Array {
  if (polygon.length < 3) return new Int32Array(0);
  const bounds = polygonBounds(polygon);
  const out: number[] = [];
  for (const i of tree.range(bounds.x0, bounds.y0, bounds.x1, bounds.y1)) {
    const p = tree.point(i);
    if (pointInPolygon(p.x, p.y, polygon)) out.push(i);
  }
  out.sort((a, b) => a - b);
  return Int32Array.from(out);
}

function polygonBounds(polygon: ReadonlyArray<Point2D>): RectQuery {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of polygon) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
}

export function pointInPolygon(x: number, y: number, polygon: ReadonlyArray<Point2D>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    const crosses =
      pi.y > y !== pj.y > y &&
      x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

// Packed-bitmap helpers. `buf` is `Uint8Array` of length `Math.ceil(n / 8)`.
export function bitGet(buf: Uint8Array, i: number): boolean {
  return (buf[i >> 3]! & (1 << (i & 7))) !== 0;
}

export function bitSet(buf: Uint8Array, i: number): void {
  buf[i >> 3] = buf[i >> 3]! | (1 << (i & 7));
}

export function bitClear(buf: Uint8Array, i: number): void {
  buf[i >> 3] = buf[i >> 3]! & ~(1 << (i & 7));
}

export function packedBitsAllZero(buf: Uint8Array): boolean {
  for (let i = 0; i < buf.length; i++) if (buf[i]! !== 0) return false;
  return true;
}
