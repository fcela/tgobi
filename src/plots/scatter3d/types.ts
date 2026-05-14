export interface Scatter3DRenderState {
  color: ReadonlyArray<string>;
  alpha: number;
  pointSize: number;
  selected: Uint8Array;
  paint: Uint8Array;
  shadow: Uint8Array;
  paintPalette: ReadonlyArray<string>;
  depthCue: "none" | "alpha" | "size";
}

export interface Camera3D {
  theta: number;
  phi: number;
  distance: number;
  centerX: number;
  centerY: number;
  centerZ: number;
}

export interface Scatter3DTransform {
  project: (x: number, y: number, z: number) => { px: number; py: number; depth: number };
}

export interface Scatter3DViewport {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
}

export interface Scatter3DRenderer {
  attach(canvas: HTMLCanvasElement): void;
  setData(
    x: Float64Array | Int32Array,
    y: Float64Array | Int32Array,
    z: Float64Array | Int32Array,
    xMissing: Uint8Array,
    yMissing: Uint8Array,
    zMissing: Uint8Array,
  ): void;
  setSize(width: number, height: number): void;
  setCamera(camera: Camera3D): void;
  getDataBounds(): Scatter3DViewport;
  draw(visual: Scatter3DRenderState): void;
  transform(): Scatter3DTransform;
  resetCamera(): void;
  detach(): void;
}
