/**
 * Pure rendering helper for the scatterplot matrix.
 * Called from Scatmat.tsx; no React or store dependencies.
 */

import { bitGet } from "@/lib/brush/hitTest";
import type { Edges } from "@/lib/edges/types";

const GUTTER = 6;        // px between cells
const CELL_MARGIN = 10;  // px inside each cell (so points don't crowd borders)
const POINT_R = 1.5;     // point radius (smaller than single scatter)
const SHADOW_ALPHA = 0.15;
const HALO_R = 3.5;
const HALO_ALPHA = 0.85;

function drawMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  shapeIdx: number,
  stroke = false,
): void {
  const shape = shapeIdx <= 1 ? 1 : shapeIdx;
  ctx.beginPath();
  if (shape === 2) {
    ctx.rect(x - r, y - r, r * 2, r * 2);
  } else if (shape === 3) {
    ctx.moveTo(x, y - r * 1.25);
    ctx.lineTo(x + r * 1.2, y + r);
    ctx.lineTo(x - r * 1.2, y + r);
    ctx.closePath();
  } else if (shape === 4) {
    ctx.moveTo(x, y - r * 1.35);
    ctx.lineTo(x + r * 1.35, y);
    ctx.lineTo(x, y + r * 1.35);
    ctx.lineTo(x - r * 1.35, y);
    ctx.closePath();
  } else {
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  if (stroke) ctx.stroke();
  else ctx.fill();
}

export interface CellRect {
  /** top-left canvas pixel of the outer cell */
  x: number;
  y: number;
  /** outer cell width / height */
  w: number;
  h: number;
}

export interface ScatmatLayout {
  n: number;
  cells: CellRect[][];   // [row i][col j]
  cellW: number;
  cellH: number;
}

export function computeLayout(canvasW: number, canvasH: number, n: number): ScatmatLayout {
  const cellW = Math.max(1, (canvasW - GUTTER * (n - 1)) / n);
  const cellH = Math.max(1, (canvasH - GUTTER * (n - 1)) / n);
  const cells: CellRect[][] = [];
  for (let i = 0; i < n; i++) {
    cells.push([]);
    for (let j = 0; j < n; j++) {
      cells[i]!.push({
        x: j * (cellW + GUTTER),
        y: i * (cellH + GUTTER),
        w: cellW,
        h: cellH,
      });
    }
  }
  return { n, cells, cellW, cellH };
}

/** Inner pixel rect for a cell (after CELL_MARGIN) */
export function innerRect(cell: CellRect): { x: number; y: number; w: number; h: number } {
  return {
    x: cell.x + CELL_MARGIN,
    y: cell.y + CELL_MARGIN,
    w: Math.max(1, cell.w - 2 * CELL_MARGIN),
    h: Math.max(1, cell.h - 2 * CELL_MARGIN),
  };
}

/** Data range for a column (min/max of non-missing values). */
export function dataRange(
  values: Float64Array | Int32Array,
  missing: Uint8Array,
): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    if (bitGet(missing, i)) continue;
    const v = values[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!isFinite(min)) { min = 0; max = 1; }
  if (min === max) { min -= 0.5; max += 0.5; }
  return { min, max };
}

/** Map a data value to a pixel coord inside the inner rect. */
export function dataToPx(
  v: number,
  min: number,
  max: number,
  pxStart: number,
  pxLen: number,
  invert: boolean,
): number {
  const t = (v - min) / (max - min);
  return invert ? pxStart + (1 - t) * pxLen : pxStart + t * pxLen;
}

export interface VisualState {
  color: ReadonlyArray<string>;
  alpha: number;
  selected: Uint8Array;
  paint: Uint8Array;
  shape: Uint8Array;
  shadow: Uint8Array;
  paintPalette: ReadonlyArray<string>;
}

export interface BrushOverlay {
  tool: "rectangle" | "ellipse" | "lasso";
  rect: { x0: number; y0: number; x1: number; y1: number } | null;
  path?: ReadonlyArray<{ x: number; y: number }> | null;
}

export interface ScatmatEdgeOverlay {
  edges: Edges;
  color: string;
  alpha: number;
  perEdgeColors?: ReadonlyArray<string>;
  edgeMask?: Uint8Array;
}

/**
 * Draw one off-diagonal cell (i, j) of the scatmat onto ctx.
 *
 * xValues / xMissing are for variables[j] (X axis in this cell).
 * yValues / yMissing are for variables[i] (Y axis in this cell).
 */
export function drawCell(
  ctx: CanvasRenderingContext2D,
  cell: CellRect,
  xValues: Float64Array | Int32Array,
  xMissing: Uint8Array,
  yValues: Float64Array | Int32Array,
  yMissing: Uint8Array,
  visual: VisualState,
  activeBrush: BrushOverlay | null,
  edgeOverlay: ScatmatEdgeOverlay | null = null,
): void {
  const ir = innerRect(cell);

  // frame
  ctx.strokeStyle = "#2a2a2a";
  ctx.lineWidth = 0.5;
  ctx.strokeRect(cell.x + 0.5, cell.y + 0.5, cell.w - 1, cell.h - 1);

  const xRange = dataRange(xValues, xMissing);
  const yRange = dataRange(yValues, yMissing);
  const n = xValues.length;

  const toPx = (xi: number, yi: number) => ({
    px: dataToPx(xi, xRange.min, xRange.max, ir.x, ir.w, false),
    py: dataToPx(yi, yRange.min, yRange.max, ir.y, ir.h, true),
  });

  drawEdges(ctx, edgeOverlay, toPx, xValues, xMissing, yValues, yMissing, visual.shadow);

  // pass 1: shadowed (faint)
  for (let i = 0; i < n; i++) {
    if (bitGet(xMissing, i) || bitGet(yMissing, i)) continue;
    if (!bitGet(visual.shadow, i)) continue;
    const { px, py } = toPx(xValues[i]!, yValues[i]!);
    ctx.globalAlpha = SHADOW_ALPHA;
    ctx.fillStyle = visual.color[i] ?? "#cccccc";
    drawMarker(ctx, px, py, POINT_R, visual.shape[i] ?? 0);
  }
  ctx.globalAlpha = 1;

  // pass 2: regular non-shadowed
  ctx.globalAlpha = visual.alpha;
  for (let i = 0; i < n; i++) {
    if (bitGet(xMissing, i) || bitGet(yMissing, i)) continue;
    if (bitGet(visual.shadow, i)) continue;
    const paintIdx = visual.paint[i]!;
    const fill = paintIdx > 0
      ? (visual.paintPalette[paintIdx - 1] ?? visual.color[i] ?? "#cccccc")
      : (visual.color[i] ?? "#cccccc");
    const { px, py } = toPx(xValues[i]!, yValues[i]!);
    ctx.fillStyle = fill;
    drawMarker(ctx, px, py, POINT_R, visual.shape[i] ?? 0);
  }
  ctx.globalAlpha = 1;

  // pass 3: halos for selected
  for (let i = 0; i < n; i++) {
    if (bitGet(xMissing, i) || bitGet(yMissing, i)) continue;
    if (!bitGet(visual.selected, i)) continue;
    if (bitGet(visual.shadow, i)) continue;
    const { px, py } = toPx(xValues[i]!, yValues[i]!);
    ctx.globalAlpha = HALO_ALPHA;
    ctx.strokeStyle = "#ffd400";
    ctx.lineWidth = 1.5;
    drawMarker(ctx, px, py, HALO_R, visual.shape[i] ?? 0, true);
  }
  ctx.globalAlpha = 1;

  // pass 4: brush overlay (only for the active cell)
  drawBrushOverlay(ctx, activeBrush);
}

function drawEdges(
  ctx: CanvasRenderingContext2D,
  edgeOverlay: ScatmatEdgeOverlay | null,
  toPx: (x: number, y: number) => { px: number; py: number },
  xValues: Float64Array | Int32Array,
  xMissing: Uint8Array,
  yValues: Float64Array | Int32Array,
  yMissing: Uint8Array,
  shadow: Uint8Array,
): void {
  if (!edgeOverlay || edgeOverlay.alpha <= 0) return;
  const { source, target } = edgeOverlay.edges;
  const edgeMask = edgeOverlay.edgeMask;
  const perEdge = edgeOverlay.perEdgeColors;
  const hasSelection = edgeMask && edgeMask.some((b) => b !== 0);
  ctx.save();
  ctx.lineWidth = 0.65;
  for (let e = 0; e < source.length; e++) {
    const a = source[e]!;
    const b = target[e]!;
    if (a < 0 || b < 0 || a >= xValues.length || b >= xValues.length) continue;
    if (bitGet(xMissing, a) || bitGet(yMissing, a) || bitGet(xMissing, b) || bitGet(yMissing, b)) continue;
    if (bitGet(shadow, a) || bitGet(shadow, b)) continue;
    const p0 = toPx(xValues[a]!, yValues[a]!);
    const p1 = toPx(xValues[b]!, yValues[b]!);
    const selected = hasSelection && bitGet(edgeMask!, e);
    ctx.globalAlpha = selected ? Math.min(1, edgeOverlay.alpha * 2.5) : edgeOverlay.alpha;
    ctx.strokeStyle = perEdge?.[e] ?? edgeOverlay.color;
    ctx.lineWidth = selected ? 1.3 : 0.65;
    ctx.beginPath();
    ctx.moveTo(p0.px, p0.py);
    ctx.lineTo(p1.px, p1.py);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBrushOverlay(ctx: CanvasRenderingContext2D, activeBrush: BrushOverlay | null): void {
  if (!activeBrush) return;
  ctx.fillStyle = "rgba(102,204,255,0.10)";
  ctx.strokeStyle = "rgba(102,204,255,0.85)";
  ctx.lineWidth = 1;

  if (activeBrush.tool === "lasso" && activeBrush.path && activeBrush.path.length > 0) {
    const path = activeBrush.path;
    ctx.beginPath();
    ctx.moveTo(path[0]!.x, path[0]!.y);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i]!.x, path[i]!.y);
    if (path.length > 2) ctx.closePath();
    ctx.fill();
    ctx.stroke();
    return;
  }

  const rect = activeBrush.rect;
  if (!rect) return;
  const rx0 = Math.min(rect.x0, rect.x1);
  const ry0 = Math.min(rect.y0, rect.y1);
  const rw = Math.abs(rect.x1 - rect.x0);
  const rh = Math.abs(rect.y1 - rect.y0);
  if (activeBrush.tool === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(
      rx0 + rw / 2,
      ry0 + rh / 2,
      Math.max(0.5, rw / 2),
      Math.max(0.5, rh / 2),
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(rx0, ry0, rw, rh);
    ctx.strokeRect(rx0 + 0.5, ry0 + 0.5, rw, rh);
  }
}

/** Draw the diagonal cell (variable name centred). */
export function drawDiagonal(
  ctx: CanvasRenderingContext2D,
  cell: CellRect,
  varName: string,
): void {
  ctx.clearRect(cell.x, cell.y, cell.w, cell.h);
  ctx.strokeStyle = "#2a2a2a";
  ctx.lineWidth = 0.5;
  ctx.strokeRect(cell.x + 0.5, cell.y + 0.5, cell.w - 1, cell.h - 1);

  ctx.fillStyle = "#888";
  ctx.font = `${Math.max(9, Math.min(13, cell.w / 6))}px "Space Grotesk", ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = varName.length > 10 ? varName.slice(0, 9) + "…" : varName;
  ctx.fillText(label, cell.x + cell.w / 2, cell.y + cell.h / 2);
}

/**
 * Given a canvas-relative pixel (px, py), return which cell (i, j) it belongs
 * to, or null if it falls in a gutter or outside the grid.
 */
export function hitCell(
  layout: ScatmatLayout,
  px: number,
  py: number,
): { i: number; j: number } | null {
  const { n, cells } = layout;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const c = cells[i]![j]!;
      if (px >= c.x && px < c.x + c.w && py >= c.y && py < c.y + c.h) {
        return { i, j };
      }
    }
  }
  return null;
}

/**
 * Compute pixel positions for all rows in a given cell (i, j).
 * Returns Float64Array of length 2*n: [px0, py0, px1, py1, ...]
 * with NaN for missing rows.
 */
export function cellPixelPositions(
  cell: CellRect,
  xValues: Float64Array | Int32Array,
  xMissing: Uint8Array,
  yValues: Float64Array | Int32Array,
  yMissing: Uint8Array,
): Float64Array {
  const ir = innerRect(cell);
  const xRange = dataRange(xValues, xMissing);
  const yRange = dataRange(yValues, yMissing);
  const n = xValues.length;
  const xy = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    if (bitGet(xMissing, i) || bitGet(yMissing, i)) {
      xy[2 * i] = NaN;
      xy[2 * i + 1] = NaN;
    } else {
      xy[2 * i] = dataToPx(xValues[i]!, xRange.min, xRange.max, ir.x, ir.w, false);
      xy[2 * i + 1] = dataToPx(yValues[i]!, yRange.min, yRange.max, ir.y, ir.h, true);
    }
  }
  return xy;
}
