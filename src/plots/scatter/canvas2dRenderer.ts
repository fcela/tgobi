import type {
  BiplotOverlay,
  BrushOverlay,
  DensityOverlay,
  EdgeOverlay,
  HullOverlay,
  LoessOverlay,
  RugOverlay,
  ScatterRenderer,
  ScatterRenderState,
  ScatterTransform,
  ScatterViewport,
} from "@/plots/scatter/types";
import { bitGet } from "@/lib/brush/hitTest";
import { drawHullOverlay } from "@/plots/scatter/overlay2d";

const MARGIN = 28; // inner plot margin in px
const POINT_R = 2.5; // default point radius
const SHADOW_ALPHA = 0.15;
const HALO_R = 4.5; // selected halo radius
const HALO_ALPHA = 0.85;
const DEFAULT_ALPHA = 0.65;

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
  } else if (shape === 5) {
    const s = r * 1.3;
    ctx.moveTo(x - s, y - s);
    ctx.lineTo(x + s, y + s);
    ctx.moveTo(x + s, y - s);
    ctx.lineTo(x - s, y + s);
    ctx.stroke();
    return;
  } else if (shape === 6) {
    ctx.arc(x, y, r * 1.15, 0, Math.PI * 2);
    ctx.stroke();
    return;
  } else {
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  if (stroke) ctx.stroke();
  else ctx.fill();
}

export class Canvas2DScatterRenderer implements ScatterRenderer {
  #canvas: HTMLCanvasElement | null = null;
  #ctx: CanvasRenderingContext2D | null = null;
  #w = 0; #h = 0;

  #x: Float64Array | Int32Array | null = null;
  #y: Float64Array | Int32Array | null = null;
  #xMissing: Uint8Array | null = null;
  #yMissing: Uint8Array | null = null;

  #xMin = 0; #xMax = 1; #yMin = 0; #yMax = 1;
  #viewport: ScatterViewport | null = null;

  attach(canvas: HTMLCanvasElement): void {
    this.#canvas = canvas;
    this.#ctx = canvas.getContext("2d");
    // In environments where getContext("2d") returns null (e.g. jsdom without
    // the canvas package), we allow attach to succeed. draw() is a no-op when
    // ctx is null; transform() still works since it depends only on dimensions
    // and data ranges, not the rendering context.
  }

  detach(): void {
    this.#canvas = null;
    this.#ctx = null;
  }

  setSize(width: number, height: number): void {
    this.#w = width;
    this.#h = height;
  }

  setData(
    x: Float64Array | Int32Array,
    y: Float64Array | Int32Array,
    xMissing: Uint8Array,
    yMissing: Uint8Array,
  ): void {
    if (x.length !== y.length) throw new Error(`x.length ${x.length} !== y.length ${y.length}`);
    this.#x = x; this.#y = y;
    this.#xMissing = xMissing; this.#yMissing = yMissing;
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    for (let i = 0; i < x.length; i++) {
      if (bitGet(xMissing, i) || bitGet(yMissing, i)) continue;
      const xv = x[i]!, yv = y[i]!;
      if (xv < xmin) xmin = xv; if (xv > xmax) xmax = xv;
      if (yv < ymin) ymin = yv; if (yv > ymax) ymax = yv;
    }
    if (!isFinite(xmin)) { xmin = 0; xmax = 1; }
    if (!isFinite(ymin)) { ymin = 0; ymax = 1; }
    if (xmin === xmax) { xmin -= 0.5; xmax += 0.5; }
    if (ymin === ymax) { ymin -= 0.5; ymax += 0.5; }
    this.#xMin = xmin; this.#xMax = xmax; this.#yMin = ymin; this.#yMax = ymax;
  }

  setViewport(viewport: ScatterViewport | null): void {
    this.#viewport = viewport ? normalizeViewport(viewport) : null;
  }

  getDataBounds(): ScatterViewport {
    return { xMin: this.#xMin, xMax: this.#xMax, yMin: this.#yMin, yMax: this.#yMax };
  }

  getViewBounds(): ScatterViewport {
    return this.#viewport ?? this.getDataBounds();
  }

  transform(): ScatterTransform {
    const w = this.#w, h = this.#h;
    const view = this.getViewBounds();
    const xMin = view.xMin, xMax = view.xMax, yMin = view.yMin, yMax = view.yMax;
    const innerW = Math.max(1, w - 2 * MARGIN);
    const innerH = Math.max(1, h - 2 * MARGIN);
    return {
      toPx: (dx, dy) => ({
        x: MARGIN + ((dx - xMin) / (xMax - xMin)) * innerW,
        y: MARGIN + (1 - (dy - yMin) / (yMax - yMin)) * innerH,
      }),
      toData: (px, py) => ({
        x: xMin + ((px - MARGIN) / innerW) * (xMax - xMin),
        y: yMin + (1 - (py - MARGIN) / innerH) * (yMax - yMin),
      }),
    };
  }

  draw(
    visual: ScatterRenderState,
    activeBrush: BrushOverlay | null,
    edgeOverlay: EdgeOverlay | null = null,
    hullOverlay: HullOverlay | null = null,
    densityOverlay: DensityOverlay | null = null,
    biplotOverlay: BiplotOverlay | null = null,
    rugOverlay: RugOverlay | null = null,
    loessOverlay: LoessOverlay | null = null,
  ): void {
    const ctx = this.#ctx;
    if (!ctx || !this.#x || !this.#y || !this.#xMissing || !this.#yMissing) return;
    const w = this.#w, h = this.#h;
    ctx.clearRect(0, 0, w, h);

    // light frame
    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = 1;
    ctx.strokeRect(MARGIN + 0.5, MARGIN + 0.5, w - 2 * MARGIN, h - 2 * MARGIN);

    const t = this.transform();
    const x = this.#x, y = this.#y;
    const xm = this.#xMissing, ym = this.#yMissing;
    const n = x.length;
    const pointR = Math.max(0.5, visual.pointSize || POINT_R);
    const haloR = Math.max(pointR + 2, HALO_R);

    drawEdges(ctx, edgeOverlay, t, x, y, xm, ym, visual.shadow);
    drawHullOverlay(ctx, hullOverlay);
    drawDensityOverlay(ctx, densityOverlay, t);
    drawBiplotOverlay(ctx, biplotOverlay, t);
    drawRugOverlay(ctx, rugOverlay, t);
    drawLoessOverlay(ctx, loessOverlay, t);

    // pass 1: shadowed (behind everything except edges, faint)
  for (let i = 0; i < n; i++) {
    if (bitGet(xm, i) || bitGet(ym, i)) continue;
    if (!bitGet(visual.shadow, i)) continue;
    const p = t.toPx(x[i]!, y[i]!);
    ctx.globalAlpha = SHADOW_ALPHA;
    const paintIdx = visual.paint[i]!;
    const fill = paintIdx > 0
      ? (visual.paintPalette[paintIdx - 1] ?? visual.color[i] ?? "#cccccc")
      : (visual.color[i] ?? "#cccccc");
    ctx.fillStyle = fill;
    drawMarker(ctx, p.x, p.y, pointR, visual.shape[i] ?? 0);
  }
    ctx.globalAlpha = 1;

  // pass 2: regular non-shadowed points
  for (let i = 0; i < n; i++) {
  if (bitGet(xm, i) || bitGet(ym, i)) continue;
  if (bitGet(visual.shadow, i)) continue;
  const p = t.toPx(x[i]!, y[i]!);
  const paintIdx = visual.paint[i]!;
  const fill = paintIdx > 0
  ? (visual.paintPalette[paintIdx - 1] ?? visual.color[i] ?? "#cccccc")
  : (visual.color[i] ?? "#cccccc");
  ctx.globalAlpha = visual.alpha;
  ctx.fillStyle = fill;
  drawMarker(ctx, p.x, p.y, pointR, visual.shape[i] ?? 0);
  }
  ctx.globalAlpha = 1;

  // pass 3: selected halos drawn last
  for (let i = 0; i < n; i++) {
    if (bitGet(xm, i) || bitGet(ym, i)) continue;
    if (!bitGet(visual.selected, i)) continue;
    if (bitGet(visual.shadow, i)) continue;
    const p = t.toPx(x[i]!, y[i]!);
    ctx.globalAlpha = HALO_ALPHA;
    ctx.strokeStyle = "#ffd400";
    ctx.lineWidth = 1.5;
    drawMarker(ctx, p.x, p.y, haloR, visual.shape[i] ?? 0, true);
  }
  ctx.globalAlpha = 1;

  // pass 3.5: marginal/rug glyphs for rows missing one axis
  if (visual.showMarginals) {
    const rugLen = 6;
    ctx.globalAlpha = visual.alpha * 0.6;
    for (let i = 0; i < n; i++) {
      const xMiss = bitGet(xm, i);
      const yMiss = bitGet(ym, i);
      if (xMiss && yMiss) continue;
      if (!xMiss && !yMiss) continue;
      const fill = visual.color[i] ?? "#cccccc";
      ctx.fillStyle = fill;
      if (xMiss && !yMiss) {
        const p = t.toPx(this.#xMin!, y[i]!);
        ctx.fillRect(MARGIN - rugLen, p.y - 1, rugLen, 2);
      } else if (!xMiss && yMiss) {
        const p = t.toPx(x[i]!, this.#yMin!);
        ctx.fillRect(p.x - 1, MARGIN + (h - 2 * MARGIN) + 1, 2, rugLen);
      }
    }
    ctx.globalAlpha = 1;
  }

    // pass 4: active brush overlay
    drawBrushOverlay(ctx, activeBrush);
  }
}

function drawDensityOverlay(
  ctx: CanvasRenderingContext2D,
  overlay: DensityOverlay | null,
  t: ScatterTransform,
): void {
  if (!overlay || overlay.contours.length === 0) return;
  for (const contour of overlay.contours) {
    ctx.strokeStyle = contour.color;
    ctx.globalAlpha = contour.alpha;
    ctx.lineWidth = 1;
    for (const path of contour.paths) {
      if (path.length < 2) continue;
      ctx.beginPath();
      const p0 = t.toPx(path[0]!.x, path[0]!.y);
      ctx.moveTo(p0.x, p0.y);
      for (let k = 1; k < path.length; k++) {
        const p = t.toPx(path[k]!.x, path[k]!.y);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function drawBiplotOverlay(
  ctx: CanvasRenderingContext2D,
  overlay: BiplotOverlay | null,
  t: ScatterTransform,
): void {
  if (!overlay || overlay.arrows.length === 0) return;
  const origin = t.toPx(0, 0);
  ctx.globalAlpha = overlay.alpha;
  ctx.strokeStyle = overlay.color;
  ctx.fillStyle = overlay.color;
  ctx.lineWidth = 1.5;
  ctx.font = '10px "Space Grotesk", ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  for (const arrow of overlay.arrows) {
    const tip = t.toPx(arrow.x, arrow.y);
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    const dx = tip.x - origin.x;
    const dy = tip.y - origin.y;
    const len = Math.hypot(dx, dy);
    if (len > 8) {
      const ux = dx / len, uy = dy / len;
      const aLen = 8;
      const aW = 3;
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(tip.x - aLen * ux + aW * uy, tip.y - aLen * uy - aW * ux);
      ctx.lineTo(tip.x - aLen * ux - aW * uy, tip.y - aLen * uy + aW * ux);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillText(arrow.label, tip.x + 4, tip.y - 4);
  }
  ctx.globalAlpha = 1;
}

function drawRugOverlay(
  ctx: CanvasRenderingContext2D,
  overlay: RugOverlay | null,
  t: ScatterTransform,
): void {
  if (!overlay) return;
  const { x, y, xMissing, yMissing, color, alpha, length } = overlay;
  const n = x.length;
  const plotBottom = t.toPx(0, t.toData(0, 0).y).y + length;
  const plotLeft = t.toPx(0, 0).x - length;
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    if (bitGet(xMissing, i)) continue;
    const px = t.toPx(x[i]!, 0).x;
    ctx.beginPath();
    ctx.moveTo(px, plotBottom - length);
    ctx.lineTo(px, plotBottom);
    ctx.stroke();
  }
  for (let i = 0; i < n; i++) {
    if (bitGet(yMissing, i)) continue;
    const py = t.toPx(0, y[i]!).y;
    ctx.beginPath();
    ctx.moveTo(plotLeft, py);
    ctx.lineTo(plotLeft + length, py);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawLoessOverlay(
  ctx: CanvasRenderingContext2D,
  overlay: LoessOverlay | null,
  t: ScatterTransform,
): void {
  if (!overlay || overlay.points.length < 2) return;
  ctx.strokeStyle = overlay.color;
  ctx.globalAlpha = overlay.alpha;
  ctx.lineWidth = overlay.width;
  ctx.lineJoin = "round";
  ctx.beginPath();
  const p0 = t.toPx(overlay.points[0]!.x, overlay.points[0]!.y);
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < overlay.points.length; i++) {
    const p = t.toPx(overlay.points[i]!.x, overlay.points[i]!.y);
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function normalizeViewport(viewport: ScatterViewport): ScatterViewport {
  const xMin = Math.min(viewport.xMin, viewport.xMax);
  const xMax = Math.max(viewport.xMin, viewport.xMax);
  const yMin = Math.min(viewport.yMin, viewport.yMax);
  const yMax = Math.max(viewport.yMin, viewport.yMax);
  return {
    xMin,
    xMax: xMax === xMin ? xMin + 1 : xMax,
    yMin,
    yMax: yMax === yMin ? yMin + 1 : yMax,
  };
}

function drawEdges(
  ctx: CanvasRenderingContext2D,
  edgeOverlay: EdgeOverlay | null,
  t: ScatterTransform,
  x: Float64Array | Int32Array,
  y: Float64Array | Int32Array,
  xMissing: Uint8Array,
  yMissing: Uint8Array,
  shadow: Uint8Array,
): void {
  if (!edgeOverlay || edgeOverlay.alpha <= 0) return;
  const { source, target } = edgeOverlay.edges;
  const perEdge = edgeOverlay.perEdgeColors;
  const edgeMask = edgeOverlay.edgeMask;
  const hasSelection = edgeMask && edgeMask.some((b) => b !== 0);
  ctx.save();
  ctx.globalAlpha = edgeOverlay.alpha;
  ctx.lineWidth = 1;
  if (perEdge) {
    for (let e = 0; e < source.length; e++) {
      const a = source[e]!;
      const b = target[e]!;
      if (a < 0 || b < 0 || a >= x.length || b >= x.length) continue;
      if (bitGet(xMissing, a) || bitGet(yMissing, a) || bitGet(xMissing, b) || bitGet(yMissing, b)) continue;
      if (bitGet(shadow, a) || bitGet(shadow, b)) continue;
      const p0 = t.toPx(x[a]!, y[a]!);
      const p1 = t.toPx(x[b]!, y[b]!);
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
        if (a < 0 || b < 0 || a >= x.length || b >= x.length) continue;
        if (bitGet(xMissing, a) || bitGet(yMissing, a) || bitGet(xMissing, b) || bitGet(yMissing, b)) continue;
        if (bitGet(shadow, a) || bitGet(shadow, b)) continue;
        const p0 = t.toPx(x[a]!, y[a]!);
        const p1 = t.toPx(x[b]!, y[b]!);
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
        if (a < 0 || b < 0 || a >= x.length || b >= x.length) continue;
        if (bitGet(xMissing, a) || bitGet(yMissing, a) || bitGet(xMissing, b) || bitGet(yMissing, b)) continue;
        if (bitGet(shadow, a) || bitGet(shadow, b)) continue;
        const p0 = t.toPx(x[a]!, y[a]!);
        const p1 = t.toPx(x[b]!, y[b]!);
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
      }
      ctx.stroke();
    }
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
  const x0 = Math.min(rect.x0, rect.x1);
  const y0 = Math.min(rect.y0, rect.y1);
  const wRect = Math.abs(rect.x1 - rect.x0);
  const hRect = Math.abs(rect.y1 - rect.y0);
  if (activeBrush.tool === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(
      x0 + wRect / 2,
      y0 + hRect / 2,
      Math.max(0.5, wRect / 2),
      Math.max(0.5, hRect / 2),
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(x0, y0, wRect, hRect);
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, wRect, hRect);
  }
}
