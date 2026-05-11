import createRegl from "regl";
import type { DrawCommand, Regl } from "regl";
import { bitGet } from "@/lib/brush/hitTest";
import {
  dataToY,
  drawParcoordsAxes,
  drawParcoordsBrush,
  PARCOORDS_DEFAULT_LINE_ALPHA,
  PARCOORDS_SELECTED_ALPHA,
  PARCOORDS_SHADOW_ALPHA,
  type ParcoordsLayout,
  type VisualState,
} from "@/plots/parcoords/parcoordsRender";

type NumericColumnData = {
  values: Float64Array | Int32Array;
  missing: Uint8Array;
};

export interface ParcoordsRenderInput {
  width: number;
  height: number;
  varNames: string[];
  cols: Array<NumericColumnData | null>;
  layout: ParcoordsLayout;
  visual: VisualState;
  brushAxis: number | null;
  brushY: { y0: number; y1: number } | null;
}

type SegmentPass = "shadow" | "normal" | "selected";

interface SegmentBufferData {
  positions: Float32Array;
  colors: Uint8Array;
  count: number;
}

export class ReglParcoordsRenderer {
  #canvas: HTMLCanvasElement | null = null;
  #overlay: HTMLCanvasElement | null = null;
  #overlayCtx: CanvasRenderingContext2D | null = null;
  #regl: Regl | null = null;
  #drawLines: DrawCommand | null = null;
  #positionBuffer: any = null;
  #colorBuffer: any = null;
  #w = 0;
  #h = 0;

  attach(canvas: HTMLCanvasElement): void {
    this.#canvas = canvas;
    this.#regl = createRegl({ canvas, extensions: [] });

    this.#overlay = document.createElement("canvas");
    this.#overlay.style.position = "absolute";
    this.#overlay.style.top = "0";
    this.#overlay.style.left = "0";
    this.#overlay.style.pointerEvents = "none";
    canvas.parentElement?.appendChild(this.#overlay);
    this.#overlayCtx = this.#overlay.getContext("2d");

    this.#positionBuffer = this.#regl.buffer({ length: 0, type: "float", usage: "dynamic" });
    this.#colorBuffer = this.#regl.buffer({ length: 0, type: "uint8", usage: "dynamic" });

    this.#drawLines = this.#regl({
      vert: `
        precision highp float;
        attribute vec2 position;
        attribute vec4 color;
        uniform vec2 u_resolution;
        varying vec4 v_color;

        void main() {
          vec2 clip = (position / u_resolution) * 2.0 - 1.0;
          clip.y *= -1.0;
          gl_Position = vec4(clip, 0.0, 1.0);
          v_color = color;
        }
      `,
      frag: `
        precision mediump float;
        varying vec4 v_color;

        void main() {
          gl_FragColor = v_color;
        }
      `,
      attributes: {
        position: this.#positionBuffer,
        color: { buffer: this.#colorBuffer, normalized: true },
      },
      uniforms: {
        u_resolution: this.#regl.prop<any, "u_resolution">("u_resolution"),
      },
      primitive: "lines",
      count: this.#regl.prop<any, "count">("count"),
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
    if (this.#overlay?.parentElement) {
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
    if (this.#regl) this.#regl._refresh();
    if (!this.#overlay) return;

    const dpr = window.devicePixelRatio || 1;
    this.#overlay.style.width = `${width}px`;
    this.#overlay.style.height = `${height}px`;
    if (this.#canvas) {
      this.#overlay.style.top = `${this.#canvas.offsetTop}px`;
      this.#overlay.style.left = `${this.#canvas.offsetLeft}px`;
    }
    this.#overlay.width = width * dpr;
    this.#overlay.height = height * dpr;
    this.#overlayCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(input: ParcoordsRenderInput): void {
    if (!this.#regl || !this.#drawLines) return;
    if (input.width < 1 || input.height < 1) return;

    this.#regl._refresh();
    this.#regl.clear({ color: [0, 0, 0, 0], depth: 1, framebuffer: null });

    this.#drawSegmentPass(buildSegments(input, "shadow"), input.width, input.height);
    this.#drawSegmentPass(buildSegments(input, "normal"), input.width, input.height);
    this.#drawSegmentPass(buildSegments(input, "selected"), input.width, input.height);

    if (this.#overlayCtx) {
      this.#overlayCtx.clearRect(0, 0, this.#w, this.#h);
      drawParcoordsAxes(this.#overlayCtx, input.width, input.height, input.varNames, input.layout);
      drawParcoordsBrush(this.#overlayCtx, input.layout, input.brushAxis, input.brushY);
    }
  }

  #drawSegmentPass(segments: SegmentBufferData, width: number, height: number): void {
    if (!this.#drawLines || segments.count === 0) return;
    this.#positionBuffer({ data: segments.positions, usage: "dynamic" });
    this.#colorBuffer({ data: segments.colors, usage: "dynamic" });
    this.#drawLines({
      count: segments.count,
      u_resolution: [width, height],
    });
  }
}

function buildSegments(input: ParcoordsRenderInput, pass: SegmentPass): SegmentBufferData {
  const { cols, layout, visual } = input;
  const { axes, plotTop, plotH } = layout;
  const nRows = rowCount(cols);
  const nAxes = axes.length;
  const segmentCount = countSegments(input, pass);
  if (segmentCount === 0) {
    return {
      positions: new Float32Array(0),
      colors: new Uint8Array(0),
      count: 0,
    };
  }

  const positions = new Float32Array(segmentCount * 4);
  const colors = new Uint8Array(segmentCount * 8);
  let p = 0;
  let c = 0;
  let count = 0;
  const alpha = passAlpha(pass, visual.alpha);

  for (let row = 0; row < nRows; row++) {
    if (!rowMatchesPass(row, pass, visual)) continue;

    const color = rowColor(pass, row, visual);
    const rgba = hexToRgba(color, alpha);
    let hasPrev = false;
    let prevX = 0;
    let prevY = 0;

    for (let axisIdx = 0; axisIdx < nAxes; axisIdx++) {
      const col = cols[axisIdx];
      const ax = axes[axisIdx];
      if (!col || !ax || bitGet(col.missing, row)) {
        hasPrev = false;
        continue;
      }

      const value = col.values[row];
      if (value == null || !Number.isFinite(value)) {
        hasPrev = false;
        continue;
      }

      const x = ax.x;
      const y = dataToY(value, ax.min, ax.max, plotTop, plotH);
      if (!Number.isFinite(y)) {
        hasPrev = false;
        continue;
      }

      if (hasPrev) {
        positions[p++] = prevX;
        positions[p++] = prevY;
        positions[p++] = x;
        positions[p++] = y;
        writeRgba(colors, c, rgba);
        c += 4;
        writeRgba(colors, c, rgba);
        c += 4;
        count += 2;
      }

      prevX = x;
      prevY = y;
      hasPrev = true;
    }
  }

  return {
    positions: positions.subarray(0, p),
    colors: colors.subarray(0, c),
    count,
  };
}

function countSegments(input: ParcoordsRenderInput, pass: SegmentPass): number {
  const { cols, layout, visual } = input;
  const { axes } = layout;
  const nRows = rowCount(cols);
  let count = 0;

  for (let row = 0; row < nRows; row++) {
    if (!rowMatchesPass(row, pass, visual)) continue;
    let hasPrev = false;

    for (let axisIdx = 0; axisIdx < axes.length; axisIdx++) {
      const col = cols[axisIdx];
      const ax = axes[axisIdx];
      if (!col || !ax || bitGet(col.missing, row)) {
        hasPrev = false;
        continue;
      }

      const value = col.values[row];
      if (value == null || !Number.isFinite(value)) {
        hasPrev = false;
        continue;
      }

      if (hasPrev) count++;
      hasPrev = true;
    }
  }

  return count;
}

function rowMatchesPass(row: number, pass: SegmentPass, visual: VisualState): boolean {
  const isShadow = bitGet(visual.shadow, row);
  const isSelected = bitGet(visual.selected, row);
  if (pass === "shadow") return isShadow;
  if (pass === "selected") return !isShadow && isSelected;
  return !isShadow && !isSelected;
}

function rowCount(cols: Array<NumericColumnData | null>): number {
  for (const col of cols) {
    if (col) return col.values.length;
  }
  return 0;
}

function passAlpha(pass: SegmentPass, alpha: number): number {
  if (pass === "shadow") return PARCOORDS_SHADOW_ALPHA;
  if (pass === "selected") return PARCOORDS_SELECTED_ALPHA;
  return clampAlpha(alpha, PARCOORDS_DEFAULT_LINE_ALPHA);
}

function rowColor(pass: SegmentPass, row: number, visual: VisualState): string {
  if (pass === "selected") return "#ffd400";
  if (pass === "normal") {
    const paintIdx = visual.paint[row] ?? 0;
    if (paintIdx > 0) {
      return visual.paintPalette[paintIdx - 1] ?? visual.color[row] ?? "#88c";
    }
  }
  return visual.color[row] ?? "#888";
}

function hexToRgba(hex: string, alpha: number): [number, number, number, number] {
  const safeHex = hex.startsWith("#") ? hex : "#888888";
  let r: number;
  let g: number;
  let b: number;
  if (safeHex.length === 4) {
    r = parseInt(safeHex[1]! + safeHex[1]!, 16);
    g = parseInt(safeHex[2]! + safeHex[2]!, 16);
    b = parseInt(safeHex[3]! + safeHex[3]!, 16);
  } else {
    r = parseInt(safeHex.slice(1, 3), 16);
    g = parseInt(safeHex.slice(3, 5), 16);
    b = parseInt(safeHex.slice(5, 7), 16);
  }
  return [r, g, b, Math.round(clampAlpha(alpha, PARCOORDS_DEFAULT_LINE_ALPHA) * 255)];
}

function writeRgba(
  colors: Uint8Array,
  offset: number,
  rgba: [number, number, number, number],
): void {
  colors[offset] = rgba[0];
  colors[offset + 1] = rgba[1];
  colors[offset + 2] = rgba[2];
  colors[offset + 3] = rgba[3];
}

function clampAlpha(alpha: number, fallback: number): number {
  if (!Number.isFinite(alpha)) return fallback;
  return Math.min(1, Math.max(0.02, alpha));
}
