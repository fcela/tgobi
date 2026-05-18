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
  /**
   * Per-row mask: 1 = render this row as an X (misclassified glyph), 0 = use
   * its `shape[i]` value normally. Consumed directly from the classification
   * slice so analysis output doesn't trample the user's brushed shapes.
   */
  misclassifiedMask?: Uint8Array | null;
}

/**
 * Overlay of synthetic decision-boundary grid points, drawn on top of the
 * normal scatter. Coords are in **data space** for whichever axes the panel
 * is showing (the caller is responsible for picking the right axes from the
 * classification slice's boundaryGrid before passing them in). Each point
 * renders as an outline ring colored by its predicted-class paint.
 */
export interface BoundaryOverlay {
  /** Data-space x coords, length n. */
  x: Float64Array;
  /** Data-space y coords, length n. */
  y: Float64Array;
  /** Paint-palette index per boundary point (1-based; 0 means skip). */
  paint: Uint8Array;
  /** 1 - max(class prob) per point — drives the indecisionThreshold filter. */
  probabilities: Float32Array;
  /** Hide boundary points whose `probabilities[i] < indecisionThreshold`. */
  indecisionThreshold: number;
  /** Palette to map paint[i]-1 → color (same palette as data points). */
  paintPalette: ReadonlyArray<string>;
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

export interface DensityOverlay {
  contours: ReadonlyArray<{
    paths: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>;
    color: string;
    alpha: number;
  }>;
}

export interface BiplotOverlay {
  arrows: ReadonlyArray<{
    x: number;
    y: number;
    label: string;
  }>;
  color: string;
  alpha: number;
}

export interface RugOverlay {
  x: Float64Array | Int32Array;
  y: Float64Array | Int32Array;
  xMissing: Uint8Array;
  yMissing: Uint8Array;
  color: string;
  alpha: number;
  length: number;
}

export interface LoessOverlay {
  points: ReadonlyArray<{ x: number; y: number }>;
  color: string;
  alpha: number;
  width: number;
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
    densityOverlay?: DensityOverlay | null,
    biplotOverlay?: BiplotOverlay | null,
    rugOverlay?: RugOverlay | null,
    loessOverlay?: LoessOverlay | null,
    boundaryOverlay?: BoundaryOverlay | null,
  ): void;
  transform(): ScatterTransform;
  detach(): void;
}
