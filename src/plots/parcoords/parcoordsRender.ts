/**
 * Pure rendering helper for the parallel coordinates plot.
 * Called from Parcoords.tsx; no React or store dependencies.
 */

import { bitGet } from "@/lib/brush/hitTest";

// Layout constants
export const MARGIN_LR = 28;   // left/right margin
export const MARGIN_TOP = 28;  // top margin
export const MARGIN_BOT = 36;  // bottom margin (room for axis labels)

export const PARCOORDS_SHADOW_ALPHA = 0.10;
export const PARCOORDS_DEFAULT_LINE_ALPHA = 0.55;
export const PARCOORDS_SELECTED_ALPHA = 1.0;
const LINE_WIDTH = 1;
const SELECTED_WIDTH = 1.5;
const AXIS_HIT_THRESHOLD = 12; // px x-distance to hit an axis

export interface AxisLayout {
  x: number;          // canvas x pixel of the axis
  varIdx: number;     // index into variables array
  min: number;        // data min for this axis
  max: number;        // data max for this axis
}

export interface ParcoordsLayout {
  axes: AxisLayout[];
  plotTop: number;    // y pixel of the plot top (after MARGIN_TOP)
  plotBot: number;    // y pixel of the plot bottom (before MARGIN_BOT)
  plotH: number;      // plotBot - plotTop
}

export interface VisualState {
  color: ReadonlyArray<string>;
  alpha: number;
  selected: Uint8Array;
  paint: Uint8Array;
  shadow: Uint8Array;
  paintPalette: ReadonlyArray<string>;
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

/** Map a data value to a y pixel (data is inverted: max at top, min at bottom). */
export function dataToY(
  v: number,
  min: number,
  max: number,
  plotTop: number,
  plotH: number,
): number {
  const t = (v - min) / (max - min);
  return plotTop + (1 - t) * plotH;
}

/** Map a canvas y pixel back to a data value. */
export function yToData(
  py: number,
  min: number,
  max: number,
  plotTop: number,
  plotH: number,
): number {
  const t = 1 - (py - plotTop) / plotH;
  return min + t * (max - min);
}

/**
 * Compute the layout for all axes given canvas dimensions and per-axis data ranges.
 */
export function computeLayout(
  canvasW: number,
  canvasH: number,
  nAxes: number,
  ranges: Array<{ min: number; max: number }>,
): ParcoordsLayout {
  const plotTop = MARGIN_TOP;
  const plotBot = Math.max(plotTop + 1, canvasH - MARGIN_BOT);
  const plotH = plotBot - plotTop;

  const axes: AxisLayout[] = [];
  for (let k = 0; k < nAxes; k++) {
    let x: number;
    if (nAxes === 1) {
      x = MARGIN_LR + (canvasW - 2 * MARGIN_LR) / 2;
    } else {
      x = MARGIN_LR + k * (canvasW - 2 * MARGIN_LR) / (nAxes - 1);
    }
    const r = ranges[k] ?? { min: 0, max: 1 };
    axes.push({ x, varIdx: k, min: r.min, max: r.max });
  }

  return { axes, plotTop, plotBot, plotH };
}

/**
 * Draw the full parcoords canvas.
 *
 * cols: per-axis column data (values + missing.buffer) — null if unavailable.
 * layout: from computeLayout.
 * visual: colours, selection state.
 * brushAxis: index into layout.axes of the axis currently being brushed, or null.
 * brushRect: the current brush y range {y0, y1} in canvas pixels, or null.
 */
export function drawParcoords(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  varNames: string[],
  cols: Array<{ values: Float64Array | Int32Array; missing: Uint8Array } | null>,
  layout: ParcoordsLayout,
  visual: VisualState,
  brushAxis: number | null,
  brushY: { y0: number; y1: number } | null,
): void {
  const { axes, plotTop, plotH } = layout;
  const nAxes = axes.length;
  if (nAxes === 0) return;

  const nRows = cols[0]?.values.length ?? 0;

  ctx.clearRect(0, 0, canvasW, canvasH);
  drawParcoordsAxes(ctx, canvasW, canvasH, varNames, layout);

  if (nRows === 0) {
    drawParcoordsBrush(ctx, layout, brushAxis, brushY);
    return;
  }

  // Precompute y-pixel for each row × axis. NaN if missing.
  // Shape: [nAxes][nRows]
  const yPx: Float64Array[] = axes.map((ax, k) => {
    const col = cols[k];
    const arr = new Float64Array(nRows);
    if (!col) {
      arr.fill(NaN);
      return arr;
    }
    for (let i = 0; i < nRows; i++) {
      if (bitGet(col.missing, i)) {
        arr[i] = NaN;
      } else {
        arr[i] = dataToY(col.values[i]!, ax.min, ax.max, plotTop, plotH);
      }
    }
    return arr;
  });

  // --- Pass 1: shadowed rows ---
  ctx.globalAlpha = PARCOORDS_SHADOW_ALPHA;
  ctx.lineWidth = LINE_WIDTH;
  for (let i = 0; i < nRows; i++) {
    if (!bitGet(visual.shadow, i)) continue;
    drawPolyline(ctx, i, axes, yPx, visual.color[i] ?? "#888", nAxes);
  }
  ctx.globalAlpha = 1;

  // --- Pass 2: regular (non-shadowed, non-selected) rows ---
  ctx.globalAlpha = clampAlpha(visual.alpha, PARCOORDS_DEFAULT_LINE_ALPHA);
  ctx.lineWidth = LINE_WIDTH;
  for (let i = 0; i < nRows; i++) {
    if (bitGet(visual.shadow, i)) continue;
    if (bitGet(visual.selected, i)) continue;
    const paintIdx = visual.paint[i]!;
    const color = paintIdx > 0
      ? (visual.paintPalette[paintIdx - 1] ?? visual.color[i] ?? "#88c")
      : (visual.color[i] ?? "#88c");
    drawPolyline(ctx, i, axes, yPx, color, nAxes);
  }
  ctx.globalAlpha = 1;

  // --- Pass 3: selected rows (bright, thick) ---
  ctx.globalAlpha = PARCOORDS_SELECTED_ALPHA;
  ctx.lineWidth = SELECTED_WIDTH;
  for (let i = 0; i < nRows; i++) {
    if (bitGet(visual.shadow, i)) continue;
    if (!bitGet(visual.selected, i)) continue;
    drawPolyline(ctx, i, axes, yPx, "#ffd400", nAxes);
  }
  ctx.globalAlpha = 1;

  drawParcoordsBrush(ctx, layout, brushAxis, brushY);
}

export function drawParcoordsAxes(
  ctx: CanvasRenderingContext2D,
  _canvasW: number,
  canvasH: number,
  varNames: string[],
  layout: ParcoordsLayout,
): void {
  const { axes, plotTop, plotBot } = layout;

  ctx.strokeStyle = "#555";
  ctx.lineWidth = 1;
  for (let k = 0; k < axes.length; k++) {
    const ax = axes[k]!;
    ctx.beginPath();
    ctx.moveTo(ax.x, plotTop);
    ctx.lineTo(ax.x, plotBot);
    ctx.stroke();

    ctx.fillStyle = "#888";
    ctx.font = "10px \"Space Grotesk\", ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(fmtVal(ax.max), ax.x, plotTop - 2);
    ctx.textBaseline = "top";
    ctx.fillText(fmtVal(ax.min), ax.x, plotBot + 2);

    ctx.fillStyle = "#aaa";
    ctx.font = "11px \"Space Grotesk\", ui-sans-serif, system-ui, sans-serif";
    ctx.textBaseline = "bottom";
    const label = varNames[k] ?? "";
    const shortLabel = label.length > 10 ? label.slice(0, 9) + "…" : label;
    ctx.fillText(shortLabel, ax.x, canvasH - 2);
  }
}

export function drawParcoordsBrush(
  ctx: CanvasRenderingContext2D,
  layout: ParcoordsLayout,
  brushAxis: number | null,
  brushY: { y0: number; y1: number } | null,
): void {
  const { axes } = layout;
  const nAxes = axes.length;
  if (brushAxis !== null && brushY !== null && brushAxis < nAxes) {
    const ax = axes[brushAxis]!;
    const ry0 = Math.min(brushY.y0, brushY.y1);
    const ry1 = Math.max(brushY.y0, brushY.y1);
    const rh = ry1 - ry0;
    ctx.fillStyle = "rgba(102,204,255,0.10)";
    ctx.strokeStyle = "rgba(102,204,255,0.85)";
    ctx.lineWidth = 1;
    const rectW = 8; // half-width of the brush rect around the axis
    ctx.fillRect(ax.x - rectW, ry0, rectW * 2, rh);
    ctx.strokeRect(ax.x - rectW + 0.5, ry0 + 0.5, rectW * 2 - 1, rh);
  }
}

function clampAlpha(alpha: number, fallback: number): number {
  if (!Number.isFinite(alpha)) return fallback;
  return Math.min(1, Math.max(0.02, alpha));
}

/** Draw a polyline for row i across all axes. Skips segments where either endpoint is NaN. */
function drawPolyline(
  ctx: CanvasRenderingContext2D,
  rowIdx: number,
  axes: AxisLayout[],
  yPx: Float64Array[],
  color: string,
  nAxes: number,
): void {
  ctx.strokeStyle = color;
  ctx.beginPath();
  let started = false;
  for (let k = 0; k < nAxes; k++) {
    const py = yPx[k]![rowIdx]!;
    if (isNaN(py)) { started = false; continue; }
    if (!started) {
      ctx.moveTo(axes[k]!.x, py);
      started = true;
    } else {
      ctx.lineTo(axes[k]!.x, py);
    }
  }
  ctx.stroke();
}

/** Format a number for tick labels. */
function fmtVal(v: number): string {
  if (!isFinite(v)) return "";
  if (Math.abs(v) >= 1e4 || (Math.abs(v) < 0.01 && v !== 0)) {
    return v.toExponential(1);
  }
  // Show at most 4 significant figures
  const s = parseFloat(v.toPrecision(4)).toString();
  return s;
}

/**
 * Given a canvas x pixel, find the nearest axis index (or null if farther than threshold).
 */
export function hitAxis(
  axes: AxisLayout[],
  px: number,
): number | null {
  let best: number | null = null;
  let bestDist = AXIS_HIT_THRESHOLD + 1;
  for (let k = 0; k < axes.length; k++) {
    const d = Math.abs(axes[k]!.x - px);
    if (d < bestDist) { bestDist = d; best = k; }
  }
  return best;
}

/**
 * For brushing: given an axis index and a y-pixel range [py0, py1],
 * return a Uint8Array mask of rows whose value on that axis falls within the range.
 * (py0 < py1 assumed; canvas y is inverted so py0=top corresponds to larger data value)
 */
export function brushAxisRange(
  axisLayout: AxisLayout,
  col: { values: Float64Array | Int32Array; missing: Uint8Array } | null,
  py0: number,
  py1: number,
  plotTop: number,
  plotH: number,
  nRows: number,
): Uint8Array {
  const mask = new Uint8Array(Math.ceil(nRows / 8));
  if (!col) return mask;

  // Convert pixel range to data range (invert y)
  const dataMax = yToData(py0, axisLayout.min, axisLayout.max, plotTop, plotH);
  const dataMin = yToData(py1, axisLayout.min, axisLayout.max, plotTop, plotH);

  for (let i = 0; i < nRows; i++) {
    if (bitGet(col.missing, i)) continue;
    const v = col.values[i]!;
    if (v >= dataMin && v <= dataMax) {
      mask[i >> 3] = mask[i >> 3]! | (1 << (i & 7));
    }
  }
  return mask;
}

/**
 * For identify: find the closest row to the canvas cursor (px, py).
 * Returns row index or -1 if none within MAX_IDENTIFY_DIST.
 */
const MAX_IDENTIFY_DIST = 10;

export function identifyRow(
  px: number,
  py: number,
  axes: AxisLayout[],
  yPx: Float64Array[],
  nRows: number,
  nAxes: number,
): number {
  let bestRow = -1;
  let bestDist = MAX_IDENTIFY_DIST + 1;

  for (let i = 0; i < nRows; i++) {
    // Compute minimum distance from (px, py) to any segment of row i's polyline
    let prevX: number | null = null;
    let prevY: number | null = null;
    let minDist = Infinity;

    for (let k = 0; k < nAxes; k++) {
      const py2 = yPx[k]![i]!;
      if (isNaN(py2)) { prevX = null; prevY = null; continue; }
      const px2 = axes[k]!.x;

      if (prevX !== null && prevY !== null) {
        // Distance from point to segment (prevX,prevY)-(px2,py2)
        const d = pointToSegmentDist(px, py, prevX, prevY, px2, py2);
        if (d < minDist) minDist = d;
      } else {
        // Just distance to the point itself
        const d = Math.hypot(px - px2, py - py2);
        if (d < minDist) minDist = d;
      }

      prevX = px2;
      prevY = py2;
    }

    if (minDist < bestDist) {
      bestDist = minDist;
      bestRow = i;
    }
  }

  return bestDist <= MAX_IDENTIFY_DIST ? bestRow : -1;
}

function pointToSegmentDist(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
