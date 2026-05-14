import type { CategoricalColumn } from "@/lib/data/types";
import type { Edges } from "@/lib/edges/types";
import { bitGet } from "@/lib/brush/hitTest";
import { minMaxDecimate } from "@/plots/timeseries/downsample";
import type { DownsampledSeries } from "@/plots/timeseries/downsample";

const MARGIN = 28;
const DOWNSAMPLE_FACTOR = 2;

export interface TimeseriesEdgeOverlay {
  edges: Edges;
  color: string;
  alpha: number;
  perEdgeColors?: ReadonlyArray<string>;
  edgeMask?: Uint8Array;
  edgePaint?: Uint8Array;
}

export interface TimeseriesRenderState {
  color: ReadonlyArray<string>;
  alpha: number;
  pointSize: number;
  selected: Uint8Array;
  paint: Uint8Array;
  shadow: Uint8Array;
  paintPalette: ReadonlyArray<string>;
  display: "points" | "lines" | "points+lines";
  ySeriesIndex: number;
}

export interface TimeseriesViewport {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface TimeseriesTransform {
  toPx: (dx: number, dy: number) => { x: number; y: number };
  toData: (px: number, py: number) => { x: number; y: number };
}

const SERIES_COLORS = [
  "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
  "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac",
];

export class TimeseriesRenderer {
  #canvas: HTMLCanvasElement | null = null;
  #ctx: CanvasRenderingContext2D | null = null;
  #w = 0;
  #h = 0;
  #xValues: Float64Array = new Float64Array(0);
  #yValues: Float64Array = new Float64Array(0);
  #xMissing: Uint8Array = new Uint8Array(0);
  #yMissing: Uint8Array = new Uint8Array(0);
  #n = 0;
  #groupCol: CategoricalColumn | null = null;
  #yNames: string[] = [];
  #viewport: TimeseriesViewport | null = null;
  #dataBounds: TimeseriesViewport = { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
  #downsampled: DownsampledSeries | null = null;
  #downsampleDirty = true;

  constructor() {}

  attach(canvas: HTMLCanvasElement) {
    this.#canvas = canvas;
    this.#ctx = canvas.getContext("2d");
  }

  setData(
    xValues: Float64Array | Int32Array,
    yValues: Float64Array | Int32Array,
    xMissing: Uint8Array,
    yMissing: Uint8Array,
    groupCol?: CategoricalColumn | null,
    yNames?: string[],
  ) {
    this.#xValues = xValues instanceof Int32Array ? new Float64Array(xValues) : xValues;
    this.#yValues = yValues instanceof Int32Array ? new Float64Array(yValues) : yValues;
    this.#xMissing = xMissing;
    this.#yMissing = yMissing;
    this.#n = this.#xValues.length;
    this.#groupCol = groupCol ?? null;
    this.#yNames = yNames ?? [];
    this.#viewport = null;
    this.#downsampleDirty = true;
    this.#computeDataBounds();
  }

  setSize(w: number, h: number) {
    if (this.#w !== w || this.#h !== h) this.#downsampleDirty = true;
    this.#w = w;
    this.#h = h;
  }

  setViewport(vp: TimeseriesViewport | null) {
    this.#viewport = vp;
  }

  getDataBounds(): TimeseriesViewport {
    return { ...this.#dataBounds };
  }

  getViewBounds(): TimeseriesViewport {
    return this.#viewport ?? this.#dataBounds;
  }

  #getDownsampled(shadow: Uint8Array): DownsampledSeries {
    if (this.#downsampleDirty || !this.#downsampled) {
      const plotW = this.#w - MARGIN * 2;
      const targetBins = Math.max(1, Math.floor(plotW * DOWNSAMPLE_FACTOR));
      this.#downsampled = minMaxDecimate(
        this.#xValues, this.#yValues,
        this.#xMissing, this.#yMissing,
        targetBins, shadow,
      );
      this.#downsampleDirty = false;
    }
    return this.#downsampled;
  }

  transform(): TimeseriesTransform {
    const vb = this.getViewBounds();
    const plotW = this.#w - MARGIN * 2;
    const plotH = this.#h - MARGIN * 2;
    return {
      toPx: (dx: number, dy: number) => ({
        x: MARGIN + ((dx - vb.xMin) / (vb.xMax - vb.xMin)) * plotW,
        y: MARGIN + plotH - ((dy - vb.yMin) / (vb.yMax - vb.yMin)) * plotH,
      }),
      toData: (px: number, py: number) => ({
        x: vb.xMin + ((px - MARGIN) / plotW) * (vb.xMax - vb.xMin),
        y: vb.yMax - ((py - MARGIN) / plotH) * (vb.yMax - vb.yMin),
      }),
    };
  }

  draw(visual: TimeseriesRenderState, edgeOverlay: TimeseriesEdgeOverlay | null = null) {
    const ctx = this.#ctx;
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = this.#w;
    const h = this.#h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (this.#n === 0) return;

    const vb = this.getViewBounds();
    const t = this.transform();
    const plotW = w - MARGIN * 2;
    const plotH = h - MARGIN * 2;

    this.#drawAxes(ctx, vb, w, h);

    const { display, color, alpha, pointSize, selected, paint, shadow, paintPalette } = visual;
    const needsDownsample = this.#n > plotW * DOWNSAMPLE_FACTOR;

    if (this.#groupCol) {
      const levels = this.#groupCol.levels;
      for (let li = 0; li < levels.length; li++) {
        const seriesColor = SERIES_COLORS[li % SERIES_COLORS.length]!;
        const rows: number[] = [];
        for (let i = 0; i < this.#n; i++) {
          if (this.#groupCol.codes[i] === li && !bitGet(this.#xMissing, i) && !bitGet(this.#yMissing, i)) {
            rows.push(i);
          }
        }
        if (needsDownsample && rows.length > plotW * DOWNSAMPLE_FACTOR) {
          if (display === "lines" || display === "points+lines") {
            this.#drawDownsampledLines(ctx, rows, seriesColor, alpha * 0.5, t, shadow, plotW);
          }
          if (display === "points" || display === "points+lines") {
            this.#drawDownsampledPoints(ctx, rows, color, seriesColor, alpha, pointSize, selected, paint, shadow, paintPalette, t, plotW);
          }
        } else {
          if (display === "lines" || display === "points+lines") {
            this.#drawSeriesLines(ctx, rows, seriesColor, alpha * 0.5, t, shadow);
          }
          if (display === "points" || display === "points+lines") {
            this.#drawSeriesPoints(ctx, rows, color, seriesColor, alpha, pointSize, selected, paint, shadow, paintPalette, t);
          }
        }
      }
    } else {
      if (needsDownsample) {
        const ds = this.#getDownsampled(shadow);
        const lineColor = SERIES_COLORS[visual.ySeriesIndex % SERIES_COLORS.length]!;
        if (display === "lines" || display === "points+lines") {
          this.#drawDownsampledEnvelope(ctx, ds, lineColor, alpha * 0.5, t);
        }
        if (display === "points" || display === "points+lines") {
          this.#drawDownsampledPointsFromDS(ctx, ds, color, lineColor, alpha, pointSize, selected, paint, shadow, paintPalette, t);
        }
      } else {
        const rows: number[] = [];
        for (let i = 0; i < this.#n; i++) {
          if (!bitGet(this.#xMissing, i) && !bitGet(this.#yMissing, i)) rows.push(i);
        }
        const lineColor = SERIES_COLORS[visual.ySeriesIndex % SERIES_COLORS.length]!;
        if (display === "lines" || display === "points+lines") {
          this.#drawSeriesLines(ctx, rows, lineColor, alpha * 0.5, t, shadow);
        }
        if (display === "points" || display === "points+lines") {
          this.#drawSeriesPoints(ctx, rows, color, lineColor, alpha, pointSize, selected, paint, shadow, paintPalette, t);
        }
      }
    }

    if (edgeOverlay) {
      this.#drawEdges(ctx, edgeOverlay, t, shadow);
    }
  }

  #drawSeriesLines(
    ctx: CanvasRenderingContext2D,
    rows: number[],
    lineColor: string,
    alpha: number,
    t: TimeseriesTransform,
    shadow: Uint8Array,
  ) {
    if (rows.length < 2) return;
    ctx.save();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    let started = false;
    for (const i of rows) {
      if (bitGet(shadow, i)) continue;
      const { x, y } = t.toPx(this.#xValues[i]!, this.#yValues[i]!);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  #drawSeriesPoints(
    ctx: CanvasRenderingContext2D,
    rows: number[],
    colors: ReadonlyArray<string>,
    defaultColor: string,
    alpha: number,
    pointSize: number,
    selected: Uint8Array,
    paint: Uint8Array,
    shadow: Uint8Array,
    paintPalette: ReadonlyArray<string>,
    t: TimeseriesTransform,
  ) {
    for (const i of rows) {
      const isShadowed = bitGet(shadow, i);
      const isSelected = bitGet(selected, i);
      const paintIdx = paint[i]!;
      let c = defaultColor;
      if (paintIdx > 0 && paintIdx - 1 < paintPalette.length) c = paintPalette[paintIdx - 1]!;
      else if (colors[i]) c = colors[i]!;
      const { x, y } = t.toPx(this.#xValues[i]!, this.#yValues[i]!);
      ctx.save();
      ctx.globalAlpha = isShadowed ? alpha * 0.15 : alpha;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, y, pointSize, 0, Math.PI * 2);
      ctx.fill();
      if (isSelected) {
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  #drawDownsampledEnvelope(
    ctx: CanvasRenderingContext2D,
    ds: DownsampledSeries,
    lineColor: string,
    alpha: number,
    t: TimeseriesTransform,
  ) {
    if (ds.binCount < 2) return;
    ctx.save();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    let started = false;
    for (let b = 0; b < ds.binCount; b++) {
      const xPx = t.toPx(ds.x[b]!, ds.yMin[b]!).x;
      const yMinPx = t.toPx(ds.x[b]!, ds.yMin[b]!).y;
      const yMaxPx = t.toPx(ds.x[b]!, ds.yMax[b]!).y;
      if (!started) {
        ctx.moveTo(xPx, yMinPx);
        started = true;
      } else {
        ctx.lineTo(xPx, yMinPx);
      }
    }
    for (let b = ds.binCount - 1; b >= 0; b--) {
      const xPx = t.toPx(ds.x[b]!, ds.yMax[b]!).x;
      const yMaxPx = t.toPx(ds.x[b]!, ds.yMax[b]!).y;
      ctx.lineTo(xPx, yMaxPx);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  #drawDownsampledPointsFromDS(
    ctx: CanvasRenderingContext2D,
    ds: DownsampledSeries,
    colors: ReadonlyArray<string>,
    defaultColor: string,
    alpha: number,
    pointSize: number,
    selected: Uint8Array,
    paint: Uint8Array,
    shadow: Uint8Array,
    paintPalette: ReadonlyArray<string>,
    t: TimeseriesTransform,
  ) {
    for (let b = 0; b < ds.binCount; b++) {
      const i = ds.indices[b]!;
      const isShadowed = bitGet(shadow, i);
      const isSelected = bitGet(selected, i);
      const paintIdx = paint[i]!;
      let c = defaultColor;
      if (paintIdx > 0 && paintIdx - 1 < paintPalette.length) c = paintPalette[paintIdx - 1]!;
      else if (colors[i]) c = colors[i]!;
      const { x, y } = t.toPx(ds.x[b]!, ds.yMin[b]!);
      ctx.save();
      ctx.globalAlpha = isShadowed ? alpha * 0.15 : alpha;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, y, pointSize, 0, Math.PI * 2);
      ctx.fill();
      if (isSelected) {
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  #drawDownsampledLines(
    ctx: CanvasRenderingContext2D,
    rows: number[],
    lineColor: string,
    alpha: number,
    t: TimeseriesTransform,
    shadow: Uint8Array,
    plotWidth: number,
  ) {
    const targetBins = Math.max(1, Math.floor(plotWidth * DOWNSAMPLE_FACTOR));
    const xSub = new Float64Array(rows.length);
    const ySub = new Float64Array(rows.length);
    const xMisSub = new Uint8Array(Math.ceil(rows.length / 8));
    const yMisSub = new Uint8Array(Math.ceil(rows.length / 8));
    for (let j = 0; j < rows.length; j++) {
      const i = rows[j]!;
      xSub[j] = this.#xValues[i]!;
      ySub[j] = this.#yValues[i]!;
    }
    const ds = minMaxDecimate(xSub, ySub, xMisSub, yMisSub, targetBins, shadow);
    if (ds.binCount < 2) return;
    ctx.save();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    let started = false;
    for (let b = 0; b < ds.binCount; b++) {
      const xPx = t.toPx(ds.x[b]!, ds.yMin[b]!).x;
      const yMinPx = t.toPx(ds.x[b]!, ds.yMin[b]!).y;
      if (!started) { ctx.moveTo(xPx, yMinPx); started = true; }
      else { ctx.lineTo(xPx, yMinPx); }
    }
    for (let b = ds.binCount - 1; b >= 0; b--) {
      const xPx = t.toPx(ds.x[b]!, ds.yMax[b]!).x;
      const yMaxPx = t.toPx(ds.x[b]!, ds.yMax[b]!).y;
      ctx.lineTo(xPx, yMaxPx);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  #drawDownsampledPoints(
    ctx: CanvasRenderingContext2D,
    rows: number[],
    colors: ReadonlyArray<string>,
    defaultColor: string,
    alpha: number,
    pointSize: number,
    selected: Uint8Array,
    paint: Uint8Array,
    shadow: Uint8Array,
    paintPalette: ReadonlyArray<string>,
    t: TimeseriesTransform,
    plotWidth: number,
  ) {
    const step = Math.max(1, Math.floor(rows.length / (plotWidth * DOWNSAMPLE_FACTOR)));
    for (let j = 0; j < rows.length; j += step) {
      const i = rows[j]!;
      const isShadowed = bitGet(shadow, i);
      const isSelected = bitGet(selected, i);
      const paintIdx = paint[i]!;
      let c = defaultColor;
      if (paintIdx > 0 && paintIdx - 1 < paintPalette.length) c = paintPalette[paintIdx - 1]!;
      else if (colors[i]) c = colors[i]!;
      const { x, y } = t.toPx(this.#xValues[i]!, this.#yValues[i]!);
      ctx.save();
      ctx.globalAlpha = isShadowed ? alpha * 0.15 : alpha;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, y, pointSize, 0, Math.PI * 2);
      ctx.fill();
      if (isSelected) {
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  #drawEdges(
    ctx: CanvasRenderingContext2D,
    edgeOverlay: TimeseriesEdgeOverlay,
    t: TimeseriesTransform,
    shadow: Uint8Array,
  ) {
    if (edgeOverlay.alpha <= 0) return;
    const { source, target } = edgeOverlay.edges;
    const perEdge = edgeOverlay.perEdgeColors;
    const edgeMask = edgeOverlay.edgeMask;
    const hasSelection = edgeMask && edgeMask.some((b) => b !== 0);
    const n = this.#n;
    ctx.save();
    ctx.globalAlpha = edgeOverlay.alpha;
    ctx.lineWidth = 1;
    if (perEdge) {
      for (let e = 0; e < source.length; e++) {
        const a = source[e]!;
        const b = target[e]!;
        if (a < 0 || b < 0 || a >= n || b >= n) continue;
        if (bitGet(this.#xMissing, a) || bitGet(this.#yMissing, a) || bitGet(this.#xMissing, b) || bitGet(this.#yMissing, b)) continue;
        if (bitGet(shadow, a) || bitGet(shadow, b)) continue;
        const p0 = t.toPx(this.#xValues[a]!, this.#yValues[a]!);
        const p1 = t.toPx(this.#xValues[b]!, this.#yValues[b]!);
        const isSelected = hasSelection && bitGet(edgeMask!, e);
        ctx.strokeStyle = perEdge[e] ?? edgeOverlay.color;
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.globalAlpha = isSelected ? Math.min(1, edgeOverlay.alpha * 2.5) : edgeOverlay.alpha;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
    } else {
      if (hasSelection) {
        for (let e = 0; e < source.length; e++) {
          const a = source[e]!;
          const b = target[e]!;
          if (a < 0 || b < 0 || a >= n || b >= n) continue;
          if (bitGet(this.#xMissing, a) || bitGet(this.#yMissing, a) || bitGet(this.#xMissing, b) || bitGet(this.#yMissing, b)) continue;
          if (bitGet(shadow, a) || bitGet(shadow, b)) continue;
          const p0 = t.toPx(this.#xValues[a]!, this.#yValues[a]!);
          const p1 = t.toPx(this.#xValues[b]!, this.#yValues[b]!);
          const isSelected = bitGet(edgeMask!, e);
          ctx.strokeStyle = edgeOverlay.color;
          ctx.lineWidth = isSelected ? 2 : 1;
          ctx.globalAlpha = isSelected ? Math.min(1, edgeOverlay.alpha * 2.5) : edgeOverlay.alpha;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = edgeOverlay.color;
        ctx.beginPath();
        for (let e = 0; e < source.length; e++) {
          const a = source[e]!;
          const b = target[e]!;
          if (a < 0 || b < 0 || a >= n || b >= n) continue;
          if (bitGet(this.#xMissing, a) || bitGet(this.#yMissing, a) || bitGet(this.#xMissing, b) || bitGet(this.#yMissing, b)) continue;
          if (bitGet(shadow, a) || bitGet(shadow, b)) continue;
          const p0 = t.toPx(this.#xValues[a]!, this.#yValues[a]!);
          const p1 = t.toPx(this.#xValues[b]!, this.#yValues[b]!);
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  #drawAxes(ctx: CanvasRenderingContext2D, vb: TimeseriesViewport, w: number, h: number) {
    ctx.save();
    ctx.strokeStyle = "#999";
    ctx.fillStyle = "#999";
    ctx.font = "10px sans-serif";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(MARGIN, MARGIN);
    ctx.lineTo(MARGIN, h - MARGIN);
    ctx.lineTo(w - MARGIN, h - MARGIN);
    ctx.stroke();

    const xTicks = this.#niceTicks(vb.xMin, vb.xMax, 6);
    for (const val of xTicks) {
      const px = MARGIN + ((val - vb.xMin) / (vb.xMax - vb.xMin)) * (w - MARGIN * 2);
      ctx.beginPath();
      ctx.moveTo(px, h - MARGIN);
      ctx.lineTo(px, h - MARGIN + 4);
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillText(this.#formatTick(val), px, h - MARGIN + 14);
    }

    const yTicks = this.#niceTicks(vb.yMin, vb.yMax, 5);
    for (const val of yTicks) {
      const py = MARGIN + (h - MARGIN * 2) - ((val - vb.yMin) / (vb.yMax - vb.yMin)) * (h - MARGIN * 2);
      ctx.beginPath();
      ctx.moveTo(MARGIN - 4, py);
      ctx.lineTo(MARGIN, py);
      ctx.stroke();
      ctx.textAlign = "right";
      ctx.fillText(this.#formatTick(val), MARGIN - 6, py + 3);
    }

    ctx.restore();
  }

  #niceTicks(min: number, max: number, count: number): number[] {
    const range = max - min;
    if (range <= 0) return [min];
    const rough = range / count;
    const pow = Math.pow(10, Math.floor(Math.log10(rough)));
    const frac = rough / pow;
    let step: number;
    if (frac <= 1.5) step = pow;
    else if (frac <= 3) step = 2 * pow;
    else if (frac <= 7) step = 5 * pow;
    else step = 10 * pow;
    const start = Math.ceil(min / step) * step;
    const ticks: number[] = [];
    for (let v = start; v <= max + step * 0.01; v += step) ticks.push(v);
    return ticks;
  }

  #formatTick(val: number): string {
    if (Math.abs(val) >= 1e6 || (Math.abs(val) < 0.01 && val !== 0)) return val.toExponential(1);
    if (Number.isInteger(val)) return val.toString();
    return val.toFixed(2);
  }

  #computeDataBounds() {
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (let i = 0; i < this.#n; i++) {
      if (bitGet(this.#xMissing, i) || bitGet(this.#yMissing, i)) continue;
      const x = this.#xValues[i]!;
      const y = this.#yValues[i]!;
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
    if (!isFinite(xMin)) { xMin = 0; xMax = 1; yMin = 0; yMax = 1; }
    const xPad = (xMax - xMin) * 0.05 || 1;
    const yPad = (yMax - yMin) * 0.05 || 1;
    this.#dataBounds = {
      xMin: xMin - xPad,
      xMax: xMax + xPad,
      yMin: yMin - yPad,
      yMax: yMax + yPad,
    };
  }

  detach() {
    if (this.#ctx && this.#canvas) {
      this.#ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.#ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
    }
    this.#canvas = null;
    this.#ctx = null;
  }
}
