import { bitGet } from "@/lib/brush/hitTest";

export const MARGIN_LEFT = 40;
export const MARGIN_RIGHT = 18;
export const MARGIN_TOP = 18;
export const MARGIN_BOT = 36;
export const ANDREWS_DEFAULT_LINE_ALPHA = 0.55;
export const ANDREWS_SHADOW_ALPHA = 0.10;
export const ANDREWS_SELECTED_ALPHA = 1.0;
const LINE_WIDTH = 1;
const SELECTED_WIDTH = 1.5;
const T_MIN = -Math.PI;
const T_MAX = Math.PI;
const HIT_THRESHOLD = 6;

export interface AndrewsLayout {
  plotLeft: number;
  plotRight: number;
  plotTop: number;
  plotBot: number;
  plotW: number;
  plotH: number;
  yMin: number;
  yMax: number;
}

export interface VisualState {
  color: ReadonlyArray<string>;
  alpha: number;
  selected: Uint8Array;
  paint: Uint8Array;
  shadow: Uint8Array;
  paintPalette: ReadonlyArray<string>;
}

export function computeAndrewsValues(
  cols: Array<{ values: Float64Array | Int32Array; missing: Uint8Array } | null>,
  resolution: number,
  nRows: number,
): { yAll: Float64Array; yMin: number; yMax: number; rowOffsets: Int32Array } {
  const p = cols.length;
  const rowOffsets = new Int32Array(nRows);
  const yAll = new Float64Array(nRows * resolution);
  let yMin = Infinity;
  let yMax = -Infinity;

  for (let row = 0; row < nRows; row++) {
    let hasMissing = false;
    for (let k = 0; k < p; k++) {
      const col = cols[k];
      if (!col || bitGet(col.missing, row)) { hasMissing = true; break; }
    }
    rowOffsets[row] = row * resolution;
    if (hasMissing) {
      for (let j = 0; j < resolution; j++) yAll[row * resolution + j] = NaN;
      continue;
    }
    for (let j = 0; j < resolution; j++) {
      const t = T_MIN + (T_MAX - T_MIN) * j / (resolution - 1);
      let val = 0;
      for (let k = 0; k < p; k++) {
        const col = cols[k];
        if (!col) continue;
        const x = col.values[row]!;
        if (k === 0) {
          val += x / Math.SQRT2;
        } else {
          const freq = Math.ceil(k / 2);
          if (k % 2 === 1) {
            val += x * Math.sin(freq * t);
          } else {
            val += x * Math.cos(freq * t);
          }
        }
      }
      const idx = row * resolution + j;
      yAll[idx] = val;
      if (val < yMin) yMin = val;
      if (val > yMax) yMax = val;
    }
  }

  if (!isFinite(yMin)) { yMin = -1; yMax = 1; }
  if (yMin === yMax) { yMin -= 0.5; yMax += 0.5; }
  const pad = (yMax - yMin) * 0.05;
  yMin -= pad;
  yMax += pad;

  return { yAll, yMin, yMax, rowOffsets };
}

export function computeLayout(
  w: number,
  h: number,
  yMin: number,
  yMax: number,
): AndrewsLayout {
  const plotLeft = MARGIN_LEFT;
  const plotRight = w - MARGIN_RIGHT;
  const plotTop = MARGIN_TOP;
  const plotBot = h - MARGIN_BOT;
  return {
    plotLeft, plotRight, plotTop, plotBot,
    plotW: Math.max(1, plotRight - plotLeft),
    plotH: Math.max(1, plotBot - plotTop),
    yMin, yMax,
  };
}

function tToX(t: number, layout: AndrewsLayout): number {
  return layout.plotLeft + ((t - T_MIN) / (T_MAX - T_MIN)) * layout.plotW;
}

function valToY(v: number, layout: AndrewsLayout): number {
  const t = (v - layout.yMin) / (layout.yMax - layout.yMin);
  return layout.plotBot - t * layout.plotH;
}

export function drawAndrews(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  varNames: string[],
  cols: Array<{ values: Float64Array | Int32Array; missing: Uint8Array } | null>,
  resolution: number,
  yAll: Float64Array,
  layout: AndrewsLayout,
  visual: VisualState,
): void {
  const nRows = visual.color.length;
  const { alpha, selected, paint, shadow, paintPalette, color } = visual;

  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = "#2a2a2a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(layout.plotLeft, layout.plotBot);
  ctx.lineTo(layout.plotRight, layout.plotBot);
  ctx.moveTo(layout.plotLeft, layout.plotTop);
  ctx.lineTo(layout.plotLeft, layout.plotBot);
  ctx.stroke();

  ctx.fillStyle = "#999";
  ctx.font = "11px Space Grotesk, sans-serif";
  ctx.textAlign = "center";
  for (const label of ["-π", "0", "π"]) {
    const t = label === "-π" ? T_MIN : label === "0" ? 0 : T_MAX;
    const x = tToX(t, layout);
    ctx.fillText(label, x, layout.plotBot + 16);
  }
  ctx.textAlign = "right";
  ctx.fillText(layout.yMin.toFixed(1), layout.plotLeft - 4, layout.plotBot + 4);
  ctx.fillText(layout.yMax.toFixed(1), layout.plotLeft - 4, layout.plotTop + 4);

  const isSelected = (row: number) => bitGet(selected, row);
  const isShadowed = (row: number) => bitGet(shadow, row);
  const getPaint = (row: number) => paint[row] ?? 0;

  const shadowRows: number[] = [];
  const normalRows: number[] = [];
  const selectedRows: number[] = [];

  for (let row = 0; row < nRows; row++) {
    if (Number.isNaN(yAll[row * resolution])) continue;
    if (isSelected(row)) selectedRows.push(row);
    else if (isShadowed(row)) shadowRows.push(row);
    else normalRows.push(row);
  }

  const drawLine = (row: number, lineAlpha: number, width: number) => {
    const p = getPaint(row);
    let lineColor = color[row]!;
    if (p > 0) {
      lineColor = paintPalette[(p - 1) % paintPalette.length]!;
    }
    ctx.globalAlpha = lineAlpha;
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = width;
    ctx.beginPath();
    let started = false;
    for (let j = 0; j < resolution; j++) {
      const t = T_MIN + (T_MAX - T_MIN) * j / (resolution - 1);
      const v = yAll[row * resolution + j]!;
      if (Number.isNaN(v)) { started = false; continue; }
      const x = tToX(t, layout);
      const y = valToY(v, layout);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };

  for (const row of shadowRows) drawLine(row, ANDREWS_SHADOW_ALPHA, LINE_WIDTH);
  for (const row of normalRows) drawLine(row, alpha, LINE_WIDTH);
  for (const row of selectedRows) drawLine(row, ANDREWS_SELECTED_ALPHA, SELECTED_WIDTH);

  ctx.globalAlpha = 1;
}

export function identifyRow(
  px: number,
  py: number,
  yAll: Float64Array,
  resolution: number,
  layout: AndrewsLayout,
  nRows: number,
): number {
  let bestRow = -1;
  let bestDist = HIT_THRESHOLD * HIT_THRESHOLD;

  for (let row = 0; row < nRows; row++) {
    if (Number.isNaN(yAll[row * resolution])) continue;
    for (let j = 0; j < resolution - 1; j++) {
      const t0 = T_MIN + (T_MAX - T_MIN) * j / (resolution - 1);
      const t1 = T_MIN + (T_MAX - T_MIN) * (j + 1) / (resolution - 1);
      const x0 = tToX(t0, layout);
      const x1 = tToX(t1, layout);
      const v0 = yAll[row * resolution + j]!;
      const v1 = yAll[row * resolution + j + 1]!;
      if (Number.isNaN(v0) || Number.isNaN(v1)) continue;
      const y0 = valToY(v0, layout);
      const y1 = valToY(v1, layout);

      const dx = x1 - x0;
      const dy = y1 - y0;
      const len2 = dx * dx + dy * dy;
      if (len2 < 1e-8) continue;
      let t_param = ((px - x0) * dx + (py - y0) * dy) / len2;
      t_param = Math.max(0, Math.min(1, t_param));
      const nearX = x0 + t_param * dx;
      const nearY = y0 + t_param * dy;
      const dist2 = (px - nearX) * (px - nearX) + (py - nearY) * (py - nearY);
      if (dist2 < bestDist) {
        bestDist = dist2;
        bestRow = row;
      }
    }
  }
  return bestRow;
}
