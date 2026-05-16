import createRegl from "regl";
import type { Regl, DrawCommand } from "regl";
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

const MARGIN = 28;
const POINT_R = 2.5;
const SHADOW_ALPHA = 0.15;
const HALO_R = 4.5;
const HALO_ALPHA = 0.85;
const DEFAULT_ALPHA = 0.65;

function hexToRgba(hex: string, alpha: number): [number, number, number, number] {
  let r: number, g: number, b: number;
  if (hex.length === 4) {
    r = parseInt(hex[1]! + hex[1]!, 16);
    g = parseInt(hex[2]! + hex[2]!, 16);
    b = parseInt(hex[3]! + hex[3]!, 16);
  } else {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  }
  return [r, g, b, Math.round(alpha * 255)];
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

export class Regl2DScatterRenderer implements ScatterRenderer {
  #canvas: HTMLCanvasElement | null = null;
  #overlay: HTMLCanvasElement | null = null;
  #overlayCtx: CanvasRenderingContext2D | null = null;
  #regl: Regl | null = null;
  
  #w = 0; #h = 0;
  #xMin = 0; #xMax = 1; #yMin = 0; #yMax = 1;
  #viewport: ScatterViewport | null = null;
  #count = 0;
  #x: Float64Array | Int32Array | null = null;
  #y: Float64Array | Int32Array | null = null;

  // buffers
  #posBuffer: any = null;
  #edgeBuffer: any = null;
  #edgeColorBuffer: any = null;
  #colorBuffer: any = null; // cached visual.color
  #flagsBuffer: any = null; // shape, shadow, selected, paint logic packed

  #cachedColorRef: ReadonlyArray<string> | null = null;
  #cachedColorData: Uint8Array | null = null;

  #drawPoints: DrawCommand | null = null;
  #drawLines: DrawCommand | null = null;
  
  #xMissing: Uint8Array | null = null;
  #yMissing: Uint8Array | null = null;
  #dpr = 1;

  attach(canvas: HTMLCanvasElement): void {
    this.#canvas = canvas;
  // create regl; throws if webgl is not supported
  this.#regl = createRegl({ canvas, extensions: [] });

  // create foreground overlay for brush, hulls, labels
    this.#overlay = document.createElement("canvas");
    this.#overlay.style.position = "absolute";
    this.#overlay.style.top = "0";
    this.#overlay.style.left = "0";
    this.#overlay.style.pointerEvents = "none";
    canvas.parentElement?.appendChild(this.#overlay);
    this.#overlayCtx = this.#overlay.getContext("2d");

    this.#posBuffer = this.#regl.buffer({ length: 0, type: "float", usage: "dynamic" });
    this.#edgeBuffer = this.#regl.buffer({ length: 0, type: "float", usage: "dynamic" });
    this.#edgeColorBuffer = this.#regl.buffer({ length: 0, type: "uint8", usage: "dynamic" });
    this.#colorBuffer = this.#regl.buffer({ length: 0, type: "uint8", usage: "dynamic" });
    this.#flagsBuffer = this.#regl.buffer({ length: 0, type: "uint8", usage: "dynamic" });

  this.#drawPoints = this.#regl({
  vert: `
  precision highp float;
  attribute vec2 position;
  attribute vec4 color;
  attribute float flags;

  uniform vec2 u_rangeMin;
  uniform vec2 u_rangeMax;
  uniform vec2 u_resolution;
  uniform float u_margin;
  uniform float u_dpr;
  uniform float u_pass; // 0=shadow, 1=normal, 2=halo
  uniform float u_alpha;
  uniform float u_pointSize;

  varying vec4 v_color;
  varying float v_shape;
  varying float v_pass;
  varying float v_alpha;

  void main() {
  float f = flags;

  float isMissing = mod(f, 2.0);
  f = floor(f / 2.0);
  float isShadow = mod(f, 2.0);
  f = floor(f / 2.0);
  float isSelected = mod(f, 2.0);
  f = floor(f / 2.0);
  float shape = f; // remaining is shape

  // filter by pass
  if (isMissing > 0.5) {
    gl_Position = vec4(-2.0, -2.0, 0.0, 1.0);
    return;
  }
  if (u_pass == 0.0 && isShadow < 0.5) { gl_Position = vec4(-2.0); return; }
  if (u_pass == 1.0 && (isShadow > 0.5 || isSelected > 0.5)) { gl_Position = vec4(-2.0); return; }
  if (u_pass == 2.0 && (isShadow > 0.5 || isSelected < 0.5)) { gl_Position = vec4(-2.0); return; }

  v_color = color;
  v_shape = shape;
  v_pass = u_pass;
  v_alpha = (u_pass == 0.0) ? ${SHADOW_ALPHA} : ((u_pass == 2.0) ? ${HALO_ALPHA} : u_alpha * color.a);

  float marginPx = u_margin * u_dpr;
  vec2 innerSize = max(vec2(1.0), u_resolution - 2.0 * marginPx);
  vec2 t = (position - u_rangeMin) / (u_rangeMax - u_rangeMin);
  t.y = 1.0 - t.y;
  vec2 px = marginPx + t * innerSize;

  vec2 clip = (px / u_resolution) * 2.0 - 1.0;
  clip.y *= -1.0;
  gl_Position = vec4(clip, 0.0, 1.0);

  gl_PointSize = u_dpr * ((u_pass == 2.0) ? max(${(HALO_R * 2.5).toFixed(1)}, (u_pointSize + 2.0) * 2.5) : max(1.0, u_pointSize * 2.0));
  }
  `,
  frag: `
  precision mediump float;
  varying vec4 v_color;
  varying float v_shape;
  varying float v_pass;
  varying float v_alpha;

  void main() {
  vec2 pc = gl_PointCoord * 2.0 - 1.0;

  if (v_shape <= 1.5) { // circle
    float dist = length(pc);
    if (dist > 1.0) discard;
    if (v_pass == 2.0 && dist < 0.6) discard; // hollow halo
  } else if (v_shape <= 2.5) { // square
    if (v_pass == 2.0) { // hollow square
    if (abs(pc.x) < 0.6 && abs(pc.y) < 0.6) discard;
    }
  } else if (v_shape <= 3.5) { // triangle
    if (pc.y < pc.x - 1.0 || pc.y < -pc.x - 1.0 || pc.y > 0.5) discard;
    if (v_pass == 2.0) { // hollow triangle
    if (pc.y > pc.x - 0.4 && pc.y > -pc.x - 0.4 && pc.y < 0.1) discard;
    }
        } else if (v_shape <= 4.5) { // diamond
        if (abs(pc.x) + abs(pc.y) > 1.0) discard;
        if (v_pass == 2.0 && abs(pc.x) + abs(pc.y) < 0.6) discard;
      } else if (v_shape <= 5.5) { // X cross
        float d1 = abs(pc.x - pc.y) / 1.414;
        float d2 = abs(pc.x + pc.y) / 1.414;
        float d = min(d1, d2);
        if (d > 0.35) discard;
        if (v_pass == 2.0 && d < 0.15) discard;
      } else if (v_shape <= 6.5) { // ring (outline circle)
        float dist = length(pc);
        if (dist > 1.0) discard;
        if (dist < 0.55) discard;
        if (v_pass == 2.0 && dist < 0.75) discard;
      } else {
        float dist = length(pc);
        if (dist > 1.0) discard;
        if (v_pass == 2.0 && dist < 0.6) discard;
      }

  if (v_pass == 2.0) {
    gl_FragColor = vec4(1.0, 0.83, 0.0, v_alpha); // #ffd400
  } else {
    gl_FragColor = vec4(v_color.rgb, v_alpha);
  }
  }
  `,
  attributes: {
  position: this.#posBuffer,
  color: { buffer: this.#colorBuffer, normalized: true },
  flags: this.#flagsBuffer
  },
  uniforms: {
  u_rangeMin: this.#regl.prop<any, 'u_rangeMin'>('u_rangeMin'),
  u_rangeMax: this.#regl.prop<any, 'u_rangeMax'>('u_rangeMax'),
  u_resolution: this.#regl.prop<any, 'u_resolution'>('u_resolution'),
  u_margin: MARGIN,
  u_dpr: this.#regl.prop<any, 'u_dpr'>('u_dpr'),
  u_pass: this.#regl.prop<any, 'u_pass'>('u_pass'),
  u_alpha: this.#regl.prop<any, 'u_alpha'>('u_alpha'),
  u_pointSize: this.#regl.prop<any, 'u_pointSize'>('u_pointSize')
  },
      primitive: 'points',
      count: this.#regl.prop<any, 'count'>('count'),
      blend: {
        enable: true,
        func: {
          srcRGB: 'src alpha',
          srcAlpha: 1,
          dstRGB: 'one minus src alpha',
          dstAlpha: 1
        }
      },
      depth: { enable: false }
    });

    this.#drawLines = this.#regl({
      vert: `
      precision highp float;
      attribute vec2 position;
      attribute vec4 a_edgeColor;

      uniform vec2 u_rangeMin;
      uniform vec2 u_rangeMax;
      uniform vec2 u_resolution;
      uniform float u_margin;
      uniform float u_dpr;
      uniform float u_perEdgeColor;

      varying vec4 v_edgeColor;

      void main() {
      float marginPx = u_margin * u_dpr;
      vec2 innerSize = max(vec2(1.0), u_resolution - 2.0 * marginPx);
      vec2 t = (position - u_rangeMin) / (u_rangeMax - u_rangeMin);
      t.y = 1.0 - t.y;
      vec2 px = marginPx + t * innerSize;

      vec2 clip = (px / u_resolution) * 2.0 - 1.0;
      clip.y *= -1.0;
      gl_Position = vec4(clip, 0.0, 1.0);
      v_edgeColor = a_edgeColor;
      }
      `,
      frag: `
      precision mediump float;
      uniform vec4 u_color;
      uniform float u_perEdgeColor;
      varying vec4 v_edgeColor;

      void main() {
      if (u_perEdgeColor > 0.5) {
        gl_FragColor = v_edgeColor;
      } else {
        gl_FragColor = u_color;
      }
      }
      `,
      attributes: {
        position: this.#edgeBuffer,
        a_edgeColor: { buffer: this.#edgeColorBuffer, normalized: true },
      },
      uniforms: {
        u_rangeMin: this.#regl.prop<any, 'u_rangeMin'>('u_rangeMin'),
        u_rangeMax: this.#regl.prop<any, 'u_rangeMax'>('u_rangeMax'),
        u_resolution: this.#regl.prop<any, 'u_resolution'>('u_resolution'),
        u_margin: MARGIN,
        u_dpr: this.#regl.prop<any, 'u_dpr'>('u_dpr'),
        u_color: this.#regl.prop<any, 'u_color'>('u_color'),
        u_perEdgeColor: this.#regl.prop<any, 'u_perEdgeColor'>('u_perEdgeColor'),
      },
      primitive: "lines",
      count: this.#regl.prop<any, 'count'>('count'),
      blend: {
        enable: true,
        func: {
          srcRGB: "src alpha",
          srcAlpha: 1,
          dstRGB: "one minus src alpha",
          dstAlpha: 1,
        },
      },
      depth: { enable: false },
    });
  }

  detach(): void {
    if (this.#overlay && this.#overlay.parentElement) {
      this.#overlay.parentElement.removeChild(this.#overlay);
    }
    this.#overlay = null;
    this.#overlayCtx = null;
    if (this.#regl) {
      this.#regl.destroy();
      this.#regl = null;
    }
    this.#canvas = null;
  }

  setSize(width: number, height: number): void {
    this.#w = width;
    this.#h = height;
    this.#dpr = window.devicePixelRatio || 1;
    if (this.#regl) this.#regl._refresh();
    if (this.#overlay) {
      const dpr = window.devicePixelRatio || 1;
      this.#overlay.style.width = width + "px";
      this.#overlay.style.height = height + "px";
      if (this.#canvas) {
        this.#overlay.style.top = this.#canvas.offsetTop + "px";
        this.#overlay.style.left = this.#canvas.offsetLeft + "px";
      }
      this.#overlay.width = width * dpr;
      this.#overlay.height = height * dpr;
      if (this.#overlayCtx) this.#overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  setData(
    x: Float64Array | Int32Array,
    y: Float64Array | Int32Array,
    xMissing: Uint8Array,
    yMissing: Uint8Array,
  ): void {
    const n = x.length;
    this.#count = n;
    this.#x = x;
    this.#y = y;
    this.#xMissing = xMissing;
    this.#yMissing = yMissing;

    const pos = new Float32Array(n * 2);
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;

    for (let i = 0; i < n; i++) {
      const isMissing = bitGet(xMissing, i) || bitGet(yMissing, i);
      const xv = x[i]!, yv = y[i]!;
      pos[i * 2] = xv;
      pos[i * 2 + 1] = yv;
      if (!isMissing) {
        if (xv < xmin) xmin = xv; if (xv > xmax) xmax = xv;
        if (yv < ymin) ymin = yv; if (yv > ymax) ymax = yv;
      }
    }

    if (!isFinite(xmin)) { xmin = 0; xmax = 1; }
    if (!isFinite(ymin)) { ymin = 0; ymax = 1; }
    if (xmin === xmax) { xmin -= 0.5; xmax += 0.5; }
    if (ymin === ymax) { ymin -= 0.5; ymax += 0.5; }
    
    this.#xMin = xmin; this.#xMax = xmax; this.#yMin = ymin; this.#yMax = ymax;
    
  this.#posBuffer({ data: pos, usage: "dynamic" });
  this.#colorBuffer({ length: n * 4, type: "uint8", usage: "dynamic" });
  this.#flagsBuffer({ length: n, type: "uint8", usage: "dynamic" });
    this.#cachedColorData = null;
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
  if (!this.#regl || !this.#drawPoints) return;
  const n = this.#count;
  if (n === 0) return;

    this.#regl._refresh();

  // Cache color array
  if (this.#cachedColorRef !== visual.color || !this.#cachedColorData || this.#cachedColorData.length !== n * 4) {
  this.#cachedColorRef = visual.color;
  this.#cachedColorData = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
  const rgba = hexToRgba(visual.color[i] ?? "#cccccc", DEFAULT_ALPHA);
  this.#cachedColorData[i * 4] = rgba[0];
  this.#cachedColorData[i * 4 + 1] = rgba[1];
  this.#cachedColorData[i * 4 + 2] = rgba[2];
  this.#cachedColorData[i * 4 + 3] = rgba[3];
  }
  }

  const colorData = new Uint8Array(this.#cachedColorData);
  const flagsData = new Uint8Array(n);

  // Apply paint palette and compute flags
  for (let i = 0; i < n; i++) {
  const isMissing = this.#xMissing && this.#yMissing ? (bitGet(this.#xMissing, i) || bitGet(this.#yMissing, i)) : false;
  const isShadow = bitGet(visual.shadow, i);
  const isSelected = bitGet(visual.selected, i);
  const paintIdx = visual.paint[i]!;
  const shapeIdx = visual.shape[i] ?? 0;
  const shape = shapeIdx <= 1 ? 1 : shapeIdx;

  let f = isMissing ? 1 : 0;
  f += (isShadow ? 1 : 0) << 1;
  f += (isSelected ? 1 : 0) << 2;
  f += shape << 3;
  flagsData[i] = f;

    if (paintIdx > 0) {
      const pColor = visual.paintPalette[paintIdx - 1];
      if (pColor) {
        const rgba = hexToRgba(pColor, DEFAULT_ALPHA);
        colorData[i * 4] = rgba[0];
        colorData[i * 4 + 1] = rgba[1];
        colorData[i * 4 + 2] = rgba[2];
        colorData[i * 4 + 3] = rgba[3];
      }
    }
  }

    this.#colorBuffer.subdata(colorData);
    this.#flagsBuffer.subdata(flagsData);

    this.#regl.clear({ color: [0, 0, 0, 0], depth: 1, framebuffer: null });

    const physW = this.#w * this.#dpr;
    const physH = this.#h * this.#dpr;
  const view = this.getViewBounds();
  const baseProps = {
  count: n,
  u_rangeMin: [view.xMin, view.yMin],
  u_rangeMax: [view.xMax, view.yMax],
  u_resolution: [physW, physH],
  u_dpr: this.#dpr,
  viewport: { x: 0, y: 0, width: physW, height: physH },
  };

  this.#drawEdgeOverlay(edgeOverlay, visual, baseProps);

  const props = {
  ...baseProps,
  u_pass: 0,
  u_alpha: visual.alpha,
  u_pointSize: visual.pointSize,
  };

  // Draw passes
    props.u_pass = 0; this.#drawPoints(props); // shadows
    props.u_pass = 1; this.#drawPoints(props); // normal points
    props.u_pass = 2; this.#drawPoints(props); // selected halos

  // Frame
    if (this.#overlayCtx) {
      this.#overlayCtx.clearRect(0, 0, this.#w, this.#h);
      this.#drawDensityOverlay(densityOverlay);
      this.#drawBiplotOverlay(biplotOverlay);
      this.#drawRugOverlay(rugOverlay);
      this.#drawLoessOverlay(loessOverlay);
    drawHullOverlay(this.#overlayCtx, hullOverlay);
    this.#overlayCtx.strokeStyle = "#2a2a2a";
    this.#overlayCtx.lineWidth = 1;
    this.#overlayCtx.strokeRect(MARGIN + 0.5, MARGIN + 0.5, this.#w - 2 * MARGIN, this.#h - 2 * MARGIN);
    drawBrushOverlay(this.#overlayCtx, activeBrush);

    // Marginal/rug glyphs
    if (visual.showMarginals && this.#x && this.#y && this.#xMissing && this.#yMissing) {
      const view = this.getViewBounds();
      const innerW = Math.max(1, this.#w - 2 * MARGIN);
      const innerH = Math.max(1, this.#h - 2 * MARGIN);
      const rugLen = 6;
      this.#overlayCtx.globalAlpha = visual.alpha * 0.6;
      for (let i = 0; i < this.#count; i++) {
        const xMiss = bitGet(this.#xMissing, i);
        const yMiss = bitGet(this.#yMissing, i);
        if (xMiss && yMiss) continue;
        if (!xMiss && !yMiss) continue;
        const fill = visual.color[i] ?? "#cccccc";
        this.#overlayCtx.fillStyle = fill;
        if (xMiss && !yMiss) {
          const py = MARGIN + (1 - (this.#y[i]! - view.yMin) / (view.yMax - view.yMin)) * innerH;
          this.#overlayCtx.fillRect(MARGIN - rugLen, py - 1, rugLen, 2);
        } else if (!xMiss && yMiss) {
          const px = MARGIN + ((this.#x[i]! - view.xMin) / (view.xMax - view.xMin)) * innerW;
          this.#overlayCtx.fillRect(px - 1, MARGIN + innerH + 1, 2, rugLen);
        }
      }
      this.#overlayCtx.globalAlpha = 1;
    }
  }
  }

  #drawDensityOverlay(overlay: DensityOverlay | null): void {
    if (!overlay || !this.#overlayCtx || overlay.contours.length === 0) return;
    const view = this.getViewBounds();
    const innerW = Math.max(1, this.#w - 2 * MARGIN);
    const innerH = Math.max(1, this.#h - 2 * MARGIN);
    const toPx = (dx: number, dy: number) => ({
      x: MARGIN + ((dx - view.xMin) / (view.xMax - view.xMin)) * innerW,
      y: MARGIN + (1 - (dy - view.yMin) / (view.yMax - view.yMin)) * innerH,
    });
    for (const contour of overlay.contours) {
      this.#overlayCtx.strokeStyle = contour.color;
      this.#overlayCtx.globalAlpha = contour.alpha;
      this.#overlayCtx.lineWidth = 1;
      for (const path of contour.paths) {
        if (path.length < 2) continue;
        this.#overlayCtx.beginPath();
        const p0 = toPx(path[0]!.x, path[0]!.y);
        this.#overlayCtx.moveTo(p0.x, p0.y);
        for (let k = 1; k < path.length; k++) {
          const p = toPx(path[k]!.x, path[k]!.y);
          this.#overlayCtx.lineTo(p.x, p.y);
        }
        this.#overlayCtx.stroke();
      }
    }
    this.#overlayCtx.globalAlpha = 1;
  }

  #drawBiplotOverlay(overlay: BiplotOverlay | null): void {
    if (!overlay || !this.#overlayCtx || overlay.arrows.length === 0) return;
    const view = this.getViewBounds();
    const innerW = Math.max(1, this.#w - 2 * MARGIN);
    const innerH = Math.max(1, this.#h - 2 * MARGIN);
    const toPx = (dx: number, dy: number) => ({
      x: MARGIN + ((dx - view.xMin) / (view.xMax - view.xMin)) * innerW,
      y: MARGIN + (1 - (dy - view.yMin) / (view.yMax - view.yMin)) * innerH,
    });
    const origin = toPx(0, 0);
    const ctx = this.#overlayCtx;
    ctx.globalAlpha = overlay.alpha;
    ctx.strokeStyle = overlay.color;
    ctx.fillStyle = overlay.color;
    ctx.lineWidth = 1.5;
    ctx.font = '10px "Space Grotesk", ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    for (const arrow of overlay.arrows) {
      const tip = toPx(arrow.x, arrow.y);
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
      const dx = tip.x - origin.x;
      const dy = tip.y - origin.y;
      const len = Math.hypot(dx, dy);
      if (len > 8) {
        const ux = dx / len, uy = dy / len;
        const aLen = 8, aW = 3;
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

  #drawRugOverlay(overlay: RugOverlay | null): void {
    if (!overlay || !this.#overlayCtx) return;
    const ctx = this.#overlayCtx;
    const { x, y, xMissing, yMissing, color, alpha, length } = overlay;
    const n = x.length;
    const view = this.getViewBounds();
    const innerW = Math.max(1, this.#w - 2 * MARGIN);
    const innerH = Math.max(1, this.#h - 2 * MARGIN);
    const plotBottom = MARGIN + innerH + length;
    const plotLeft = MARGIN - length;
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      if (bitGet(xMissing, i)) continue;
      const px = MARGIN + ((x[i]! - view.xMin) / (view.xMax - view.xMin)) * innerW;
      ctx.beginPath();
      ctx.moveTo(px, plotBottom - length);
      ctx.lineTo(px, plotBottom);
      ctx.stroke();
    }
    for (let i = 0; i < n; i++) {
      if (bitGet(yMissing, i)) continue;
      const py = MARGIN + (1 - (y[i]! - view.yMin) / (view.yMax - view.yMin)) * innerH;
      ctx.beginPath();
      ctx.moveTo(plotLeft, py);
      ctx.lineTo(plotLeft + length, py);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  #drawLoessOverlay(overlay: LoessOverlay | null): void {
    if (!overlay || !this.#overlayCtx || overlay.points.length < 2) return;
    const ctx = this.#overlayCtx;
    const view = this.getViewBounds();
    const innerW = Math.max(1, this.#w - 2 * MARGIN);
    const innerH = Math.max(1, this.#h - 2 * MARGIN);
    const toPx = (dx: number, dy: number) => ({
      x: MARGIN + ((dx - view.xMin) / (view.xMax - view.xMin)) * innerW,
      y: MARGIN + (1 - (dy - view.yMin) / (view.yMax - view.yMin)) * innerH,
    });
    ctx.strokeStyle = overlay.color;
    ctx.globalAlpha = overlay.alpha;
    ctx.lineWidth = overlay.width;
    ctx.lineJoin = "round";
    ctx.beginPath();
    const p0 = toPx(overlay.points[0]!.x, overlay.points[0]!.y);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < overlay.points.length; i++) {
      const p = toPx(overlay.points[i]!.x, overlay.points[i]!.y);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  #drawEdgeOverlay(
    edgeOverlay: EdgeOverlay | null,
    visual: ScatterRenderState,
    baseProps: {
      u_rangeMin: number[];
      u_rangeMax: number[];
      u_resolution: number[];
      u_dpr: number;
      viewport: { x: number; y: number; width: number; height: number };
    },
  ): void {
    if (
      !edgeOverlay ||
      edgeOverlay.alpha <= 0 ||
      !this.#drawLines ||
      !this.#x ||
      !this.#y ||
      !this.#xMissing ||
      !this.#yMissing
    ) return;

  const { source, target } = edgeOverlay.edges;
  const perEdge = edgeOverlay.perEdgeColors;
  const edgeMask = edgeOverlay.edgeMask;
  const hasEdgeSelection = edgeMask && edgeMask.some((b) => b !== 0);
  const vertices: number[] = [];
  const edgeColors: number[] = [];
  for (let e = 0; e < source.length; e++) {
    const a = source[e]!;
    const b = target[e]!;
    if (a < 0 || b < 0 || a >= this.#count || b >= this.#count) continue;
    if (
      bitGet(this.#xMissing, a) ||
      bitGet(this.#yMissing, a) ||
      bitGet(this.#xMissing, b) ||
      bitGet(this.#yMissing, b)
    ) continue;
    if (bitGet(visual.shadow, a) || bitGet(visual.shadow, b)) continue;
    vertices.push(this.#x[a]!, this.#y[a]!, this.#x[b]!, this.#y[b]!);
    const isSelected = hasEdgeSelection && bitGet(edgeMask!, e);
    const eAlpha = isSelected ? Math.min(1, edgeOverlay.alpha * 2.5) : edgeOverlay.alpha;
    if (perEdge) {
      const rgba = hexToRgba(perEdge[e] ?? "#c7c7d8", eAlpha);
      edgeColors.push(rgba[0], rgba[1], rgba[2], rgba[3], rgba[0], rgba[1], rgba[2], rgba[3]);
    } else {
      const rgba = hexToRgba(edgeOverlay.color, eAlpha);
      edgeColors.push(rgba[0], rgba[1], rgba[2], rgba[3], rgba[0], rgba[1], rgba[2], rgba[3]);
    }
  }
  if (vertices.length === 0) return;

  this.#edgeBuffer({ data: new Float32Array(vertices), usage: "dynamic" });

  if (edgeColors.length > 0) {
    const colorData = new Uint8Array(edgeColors);
    this.#edgeColorBuffer({ data: colorData, usage: "dynamic" });
    this.#drawLines({
      ...baseProps,
      count: vertices.length / 2,
      u_color: [0, 0, 0, 1],
      u_perEdgeColor: 1,
    });
  } else {
    const [r, g, b] = hexToRgba(edgeOverlay.color, 1);
    this.#drawLines({
      ...baseProps,
      count: vertices.length / 2,
      u_color: [r / 255, g / 255, b / 255, edgeOverlay.alpha],
      u_perEdgeColor: 0,
    });
  }
  }
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
