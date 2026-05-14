import type { Edges } from "@/lib/edges/types";

export interface ScatterRenderState {
  color: ReadonlyArray<string>; // length n; CSS hex (per-row colour)
  alpha: number; // 0..1 point opacity
  pointSize: number; // point radius in CSS px
  selected: Uint8Array; // packed bit per row
  paint: Uint8Array; // byte per row, 0 = unpainted
  shape: Uint8Array; // byte per row, 0/1 circle, 2 square, 3 triangle, 4 diamond
  shadow: Uint8Array; // packed bit per row
  paintPalette: ReadonlyArray<string>; // index 1..N → CSS hex
  showMarginals: boolean; // draw marginal/rug glyphs for rows missing one axis
}

export interface ScatterTransform {
  toPx: (dx: number, dy: number) => { x: number; y: number };
  toData: (px: number, py: number) => { x: number; y: number };
}

export interface ScatterViewport {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface BrushOverlay {
  tool: "rectangle" | "ellipse" | "lasso";
  rect: { x0: number; y0: number; x1: number; y1: number } | null;
  path?: ReadonlyArray<{ x: number; y: number }> | null;
}

export interface EdgeOverlay {
  edges: Edges;
  color: string;
  alpha: number;
  perEdgeColors?: ReadonlyArray<string>;
  edgeMask?: Uint8Array;
  edgePaint?: Uint8Array;
}

export interface HullOverlay {
  hulls: ReadonlyArray<{
    points: ReadonlyArray<{ x: number; y: number }>;
    stroke: string;
    fill: string;
    alpha: number;
  }>;
}

export interface ScatterRenderer {
  attach(canvas: HTMLCanvasElement): void;
  setData(
    x: Float64Array | Int32Array,
    y: Float64Array | Int32Array,
    xMissing: Uint8Array,
    yMissing: Uint8Array,
  ): void;
  setSize(width: number, height: number): void;
  setViewport(viewport: ScatterViewport | null): void;
  getDataBounds(): ScatterViewport;
  getViewBounds(): ScatterViewport;
  draw(
    visual: ScatterRenderState,
    activeBrush: BrushOverlay | null,
    edgeOverlay?: EdgeOverlay | null,
    hullOverlay?: HullOverlay | null,
  ): void;
  transform(): ScatterTransform;
  detach(): void;
}
