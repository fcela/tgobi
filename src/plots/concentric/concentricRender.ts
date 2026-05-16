import { bitGet } from "@/lib/brush/hitTest";

export const SIZE = 420;
const CENTER = SIZE / 2;
const INNER_PAD = 14;
const RING_PAD = 10;
const DEFAULT_ALPHA = 0.55;
const SHADOW_ALPHA = 0.10;
const SELECTED_ALPHA = 1.0;
const LINE_WIDTH = 1;
const SELECTED_WIDTH = 1.5;
const LABEL_SIZE = 10;

export interface RingLayout {
  innerR: number;
  outerR: number;
  midR: number;
  min: number;
  max: number;
  label: string;
}

export interface VisualState {
  color: ReadonlyArray<string>;
  alpha: number;
  selected: Uint8Array;
  paint: Uint8Array;
  shadow: Uint8Array;
  paintPalette: ReadonlyArray<string>;
}

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

export function computeRings(
  w: number,
  h: number,
  varNames: string[],
  cols: Array<{ values: Float64Array | Int32Array; missing: Uint8Array } | null>,
): RingLayout[] {
  const n = varNames.length;
  if (n === 0) return [];
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.min(cx, cy) - INNER_PAD - RING_PAD - LABEL_SIZE;
  const ringWidth = maxR / n;
  const minR = ringWidth * 0.3;

  return varNames.map((name, i) => {
    const col = cols[i];
    const range = col ? dataRange(col.values, col.missing) : { min: 0, max: 1 };
    const innerR = minR + i * ringWidth;
    const outerR = innerR + ringWidth - RING_PAD / 2;
    return { innerR, outerR, midR: (innerR + outerR) / 2, min: range.min, max: range.max, label: name };
  });
}

export function valToAngle(v: number, min: number, max: number): number {
  const t = (v - min) / (max - min);
  return t * 2 * Math.PI - Math.PI / 2;
}

export function drawConcentric(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  varNames: string[],
  cols: Array<{ values: Float64Array | Int32Array; missing: Uint8Array } | null>,
  rings: RingLayout[],
  visual: VisualState,
): void {
  const nRows = visual.color.length;
  const { alpha, selected, paint, shadow, paintPalette, color } = visual;
  const cx = w / 2;
  const cy = h / 2;

  ctx.clearRect(0, 0, w, h);

  for (const ring of rings) {
    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, ring.midR, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.fillStyle = "#555";
    ctx.font = `${LABEL_SIZE}px Space Grotesk, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(ring.label, cx, cy - ring.outerR - 2);
  }

  const nVars = varNames.length;
  const isSelected = (row: number) => bitGet(selected, row);
  const isShadowed = (row: number) => bitGet(shadow, row);
  const getPaint = (row: number) => paint[row] ?? 0;

  const shadowRows: number[] = [];
  const normalRows: number[] = [];
  const selectedRows: number[] = [];

  for (let row = 0; row < nRows; row++) {
    let hasMissing = false;
    for (let k = 0; k < nVars; k++) {
      const col = cols[k];
      if (!col || bitGet(col.missing, row)) { hasMissing = true; break; }
    }
    if (hasMissing) continue;
    if (isSelected(row)) selectedRows.push(row);
    else if (isShadowed(row)) shadowRows.push(row);
    else normalRows.push(row);
  }

  const drawPolyline = (row: number, lineAlpha: number, width: number) => {
    const p = getPaint(row);
    let lineColor = color[row]!;
    if (p > 0) {
      lineColor = paintPalette[(p - 1) % paintPalette.length]!;
    }
    ctx.globalAlpha = lineAlpha;
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let k = 0; k < nVars; k++) {
      const col = cols[k];
      if (!col) continue;
      const ring = rings[k];
      if (!ring) continue;
      const v = col.values[row]!;
      const angle = valToAngle(v, ring.min, ring.max);
      const x = cx + Math.cos(angle) * ring.midR;
      const y = cy + Math.sin(angle) * ring.midR;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    if (nVars > 2) ctx.closePath();
    ctx.stroke();
  };

  for (const row of shadowRows) drawPolyline(row, SHADOW_ALPHA, LINE_WIDTH);
  for (const row of normalRows) drawPolyline(row, alpha, LINE_WIDTH);
  for (const row of selectedRows) drawPolyline(row, SELECTED_ALPHA, SELECTED_WIDTH);

  ctx.globalAlpha = 1;
}

export function identifyRow(
  px: number,
  py: number,
  cols: Array<{ values: Float64Array | Int32Array; missing: Uint8Array } | null>,
  rings: RingLayout[],
  nRows: number,
  cx: number,
  cy: number,
): number {
  const nVars = cols.length;
  const HIT = 6;
  let bestRow = -1;
  let bestDist = HIT * HIT;

  for (let row = 0; row < nRows; row++) {
    let hasMissing = false;
    for (let k = 0; k < nVars; k++) {
      const col = cols[k];
      if (!col || bitGet(col.missing, row)) { hasMissing = true; break; }
    }
    if (hasMissing) continue;

    for (let k = 0; k < nVars; k++) {
      const col = cols[k];
      const ring = rings[k];
      if (!col || !ring) continue;
      const v = col.values[row]!;
      const angle = valToAngle(v, ring.min, ring.max);
      const x = cx + Math.cos(angle) * ring.midR;
      const y = cy + Math.sin(angle) * ring.midR;
      const dx = px - x;
      const dy = py - y;
      const dist2 = dx * dx + dy * dy;
      if (dist2 < bestDist) {
        bestDist = dist2;
        bestRow = row;
      }
    }

    for (let k = 0; k < nVars - 1; k++) {
      const col0 = cols[k];
      const col1 = cols[k + 1];
      const ring0 = rings[k];
      const ring1 = rings[k + 1];
      if (!col0 || !col1 || !ring0 || !ring1) continue;
      const v0 = col0.values[row]!;
      const v1 = col1.values[row]!;
      const a0 = valToAngle(v0, ring0.min, ring0.max);
      const a1 = valToAngle(v1, ring1.min, ring1.max);
      const x0 = cx + Math.cos(a0) * ring0.midR;
      const y0 = cy + Math.sin(a0) * ring0.midR;
      const x1 = cx + Math.cos(a1) * ring1.midR;
      const y1 = cy + Math.sin(a1) * ring1.midR;
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len2 = dx * dx + dy * dy;
      if (len2 < 1e-8) continue;
      let t = ((px - x0) * dx + (py - y0) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const nx = x0 + t * dx;
      const ny = y0 + t * dy;
      const dist2 = (px - nx) * (px - nx) + (py - ny) * (py - ny);
      if (dist2 < bestDist) {
        bestDist = dist2;
        bestRow = row;
      }
    }
  }
  return bestRow;
}
