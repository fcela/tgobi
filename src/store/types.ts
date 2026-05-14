import type { DataFrame, DeriveSpec } from "@/lib/data/types";
import type { Edges } from "@/lib/edges/types";
import type { ProjectionPursuitIndex } from "@/lib/tour-pp/indices";
import type { VarSpec, ScalingMode } from "@/types";
import type { Linkage } from "@/lib/clustering/hierarchical";
import type { ClassificationMethod } from "@/lib/classification/types";
import type { ProjectionMethod } from "@/lib/projection/types";
import type { DendrogramData } from "@/lib/clustering/types";

export interface DataSlice {
  df: DataFrame | null;
  loading: boolean;
  error: string | null;
  setData: (df: DataFrame) => void;
  deriveColumn: (name: string, spec: DeriveSpec) => void;
  deriveSphere: (prefix: string, sources: string[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (msg: string | null) => void;
  clear: () => void;
}

export interface VariablesSlice {
  spec: VarSpec[];
  setSpec: (spec: VarSpec[]) => void;
  setIncluded: (name: string, included: boolean) => void;
  setType: (name: string, type: VarSpec["type"]) => void;
  setScaling: (name: string, scaling: ScalingMode | undefined) => void;
  setGroup: (name: string, group: string | undefined) => void;
  setGroupScaling: (group: string, scaling: ScalingMode | undefined) => void;
}

export interface SelectionSlice {
  selection: {
    mask: Uint8Array;       // 1 bit per row, packed; 1 = selected
    paint: Uint8Array;      // 1 byte per row; 0 = unpainted, otherwise palette index
    shape: Uint8Array;      // 1 byte per row; 0 = default circle, otherwise shape index
    shadow: Uint8Array;     // 1 bit per row, packed; 1 = excluded/ghosted
  };
  setSelectionMask: (mask: Uint8Array) => void;
  setSelectionPaint: (paint: Uint8Array) => void;
  setSelectionShape: (shape: Uint8Array) => void;
  setSelectionShadow: (shadow: Uint8Array) => void;
  resetSelectionFor: (nrow: number) => void;   // sized fresh arrays
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface BrushPoint {
  x: number;
  y: number;
}

export type BrushTool = "rectangle" | "ellipse" | "lasso";
export type BrushTarget = "nodes" | "edges" | "both";

export interface BrushSlice {
  brush: {
    mode: "transient" | "persistent";
    tool: BrushTool;
    target: BrushTarget;
    paintColor: number;
    paintShape: number;
    activeRect: Rect | null;
    activePath: BrushPoint[] | null;
    activePanelId: number | null;
  };
  setBrushMode: (mode: "transient" | "persistent") => void;
  setBrushTool: (tool: BrushTool) => void;
  setBrushTarget: (target: BrushTarget) => void;
  setPaintColor: (i: number) => void;
  setPaintShape: (i: number) => void;
  setActiveBrush: (panelId: number | null, rect: Rect | null, path?: BrushPoint[] | null) => void;
}

export type ColorEncoding =
  | { kind: "fixed" }
  | { kind: "paint" }
  | { kind: "byVar"; var: string; scale: "categorical" | "sequential" | "diverging" };

export interface ColorSlice {
  color: {
    encoding: ColorEncoding;
    palette: string;
  };
  setColorEncoding: (e: ColorEncoding) => void;
  setColorPalette: (p: string) => void;
}

export interface ToolsSlice {
  tools: {
    active: "brush" | "identify";
    hoverRow: number | null;
    pinnedRows: Uint8Array;
    labelVar: string | null;
  };
  setActiveTool: (t: "brush" | "identify") => void;
  setIdentifyHover: (row: number | null) => void;
  togglePinnedIdentify: (row: number) => void;
  clearPinnedIdentify: () => void;
  setIdentifyLabelVar: (name: string | null) => void;
  resetIdentifyFor: (nrow: number) => void;
}

export type EdgeColorMode = "fixed" | "paint" | "endpoint" | "attribute";
export type EdgeEditMode = "none" | "add" | "delete";

export interface EdgesSlice {
  edges: {
    layer: Edges | null;
    mode: "none" | "sequential" | "custom";
    visible: boolean;
    alpha: number;
    colorMode: EdgeColorMode;
    colorAttr: string | null;
    editMode: EdgeEditMode;
    linkNodesToEdges: boolean;
    linkEdgesToNodes: boolean;
    selection: {
      mask: Uint8Array;
      paint: Uint8Array;
      shadow: Uint8Array;
    };
  };
  setEdgesLayer: (layer: Edges | null, mode?: "none" | "sequential" | "custom") => void;
  connectRowsInOrder: () => void;
  clearEdges: () => void;
  setEdgesVisible: (visible: boolean) => void;
  setEdgeAlpha: (alpha: number) => void;
  setEdgeColorMode: (mode: EdgeColorMode) => void;
  setEdgeColorAttr: (attr: string | null) => void;
  setEdgeEditMode: (mode: EdgeEditMode) => void;
  addEdge: (source: number, target: number) => void;
  deleteEdge: (index: number) => void;
  setLinkNodesToEdges: (enabled: boolean) => void;
  setLinkEdgesToNodes: (enabled: boolean) => void;
  setEdgeSelectionMask: (mask: Uint8Array) => void;
  setEdgeSelectionPaint: (paint: Uint8Array) => void;
  setEdgeSelectionShadow: (shadow: Uint8Array) => void;
}

export interface HullsSlice {
  hulls: {
    colorGroups: boolean;
    paintGroups: boolean;
    alpha: number;
  };
  setColorHullsVisible: (visible: boolean) => void;
  setPaintHullsVisible: (visible: boolean) => void;
  setHullAlpha: (alpha: number) => void;
}

export interface ScatterPanel {
  id: number;
  kind: "scatter";
  x: string;
  y: string;
  viewport?: PlotViewport | null;
}

export interface PlotViewport {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface BarchartPanel {
  id: number;
  kind: "barchart";
  variable: string;
  bins: number;
}

export interface DotplotPanel {
  id: number;
  kind: "dotplot";
  variable: string;
  bins: number;
}

export interface ScatmatPanel {
  id: number;
  kind: "scatmat";
  variables: string[];   // 2..8 numeric/integer vars
}

export interface ParcoordsPanel {
  id: number;
  kind: "parcoords";
  variables: string[]; // 2..N numeric/integer vars; defines axis order left-to-right
}

export interface MissingPatternPanel {
  id: number;
  kind: "missingPattern";
}

export interface TimeseriesPanel {
  id: number;
  kind: "timeseries";
  x: string;
  y: string[];
  groupVar: string | null;
  display: "points" | "lines" | "points+lines";
  viewport?: PlotViewport | null;
}

export interface Scatter3DPanel {
  id: number;
  kind: "scatter3d";
  x: string;
  y: string;
  z: string;
  depthCue: "none" | "alpha" | "size";
  camera?: import("@/plots/scatter3d/types").Camera3D | null;
}

export type PlotPanel = ScatterPanel | BarchartPanel | DotplotPanel | ScatmatPanel | ParcoordsPanel | MissingPatternPanel | TimeseriesPanel | Scatter3DPanel;

export type TileId = string;

export interface TileLeaf {
  type: "leaf";
  id: TileId;
  tabs: number[];
  activeTab: number | null;
}

export interface TileSplit {
  type: "split";
  id: TileId;
  direction: "horizontal" | "vertical";
  ratio: number;
  first: TileNode;
  second: TileNode;
}

export type TileNode = TileLeaf | TileSplit;
export type TileDropPosition = "center" | "left" | "right" | "top" | "bottom";

export interface PlotsSlice {
  plots: {
    panels: PlotPanel[];
    nextId: number;
    root: TileNode | null;
    nextTileId: number;
  };
  addScatter: (x: string, y: string) => number;
  setScatterViewport: (id: number, viewport: PlotViewport | null) => void;
  addBarchart: (variable: string, bins?: number) => number;
  setBarchartBins: (id: number, bins: number) => void;
  addDotplot: (variable: string, bins?: number) => number;
  addScatmat: (variables: string[]) => number;
  addParcoords: (variables: string[]) => number;
  addMissingPattern: () => number;
  addTimeseries: (x: string, y: string[], groupVar?: string | null, display?: "points" | "lines" | "points+lines") => number;
  setTimeseriesViewport: (id: number, viewport: PlotViewport | null) => void;
  setTimeseriesDisplay: (id: number, display: "points" | "lines" | "points+lines") => void;
  addScatter3D: (x: string, y: string, z: string) => number;
  setScatter3DCamera: (id: number, camera: import("@/plots/scatter3d/types").Camera3D | null) => void;
  setScatter3DDepthCue: (id: number, depthCue: "none" | "alpha" | "size") => void;
  removePanel: (id: number) => void;
  clearPanels: () => void;
  splitTile: (tileId: TileId, direction: "horizontal" | "vertical", panelId: number, side: "first" | "second") => void;
  closeTab: (tileId: TileId, panelId: number) => void;
  setActiveTab: (tileId: TileId, panelId: number) => void;
  movePanelToTile: (panelId: number, tileId: TileId, position: TileDropPosition) => void;
  resizeSplit: (tileId: TileId, ratio: number) => void;
}

export type TourShape = "1d" | "2d";

export interface SavedView {
  id: number;
  name: string;
  panelId: number; // which panel the view applies to
  shape: TourShape;
  vars: string[];
  basis: Float64Array; // row-major p×k
}

export interface TourSlice {
  tour: {
    activePanelId: number | null;
    shape: TourShape;
    mode: "grand" | "pp" | "manual";
    ppIndex: ProjectionPursuitIndex;
    ppValue: number | null;
    isPlaying: boolean;
    speed: number;
    activeVars: string[];
    frozenVars: string[];
    manualVar: string | null;
    manualValue: number;
    basis: Float64Array | null;
    proj: Float64Array | null;
    t: number;
    savedViews: SavedView[];
    nextViewId: number;
  };
  startTour: (panelId: number, shape: TourShape, vars: string[]) => void;
  pauseTour: () => void;
  resumeTour: () => void;
  stopTour: () => void;
  setTourSpeed: (speed: number) => void;
  setTourShape: (shape: TourShape) => void;
  setTourMode: (mode: "grand" | "pp" | "manual") => void;
  setTourPpIndex: (index: ProjectionPursuitIndex) => void;
  setTourActiveVars: (vars: string[]) => void;
  toggleTourVarFrozen: (name: string) => void;
  setManualVarValue: (name: string, value: number) => void;
  setTourFrame: (basis: Float64Array, proj: Float64Array, t: number, ppValue?: number | null) => void;
  saveCurrentView: (name: string) => number;
  restoreView: (id: number) => void;
  removeView: (id: number) => void;
}

export type ImputationMethod = "none" | "fixed" | "random" | "conditional";

export interface MissingSlice {
  missing: {
    imputation: {
      method: ImputationMethod;
      fixedValue: number;
      seed: number;
      condVar: string | null;
    };
    showMarginals: boolean;
    imputationSets: number;
    imputationIndex: number;
  };
  setImputationMethod: (method: ImputationMethod) => void;
  setImputationFixedValue: (value: number) => void;
  setImputationSeed: (seed: number) => void;
  setImputationCondVar: (name: string | null) => void;
  setShowMarginals: (show: boolean) => void;
  setImputationSets: (n: number) => void;
  cycleImputation: () => void;
  setImputationIndex: (i: number) => void;
}

export type ClusteringMethod = "kmeans" | "hierarchical" | "dbscan" | "optics" | "xmeans";

export interface ClusteringSlice {
  clustering: {
    method: ClusteringMethod;
    variables: string[];
    k: number;
    linkage: Linkage;
    eps: number;
    minPts: number;
    xi: number;
    kMax: number;
    results: Int16Array | null;
    sizes: number[];
    running: boolean;
    error: string | null;
    dendrogram: DendrogramData | null;
  };
  setClusteringMethod: (method: ClusteringMethod) => void;
  setClusteringVariables: (vars: string[]) => void;
  setClusteringK: (k: number) => void;
  setClusteringLinkage: (linkage: Linkage) => void;
  setClusteringEps: (eps: number) => void;
  setClusteringMinPts: (minPts: number) => void;
  setClusteringXi: (xi: number) => void;
  setClusteringKMax: (kMax: number) => void;
  runClustering: () => void;
  applyClusteringPaint: () => void;
  clearClustering: () => void;
}

export interface ClassificationSlice {
  classification: {
    method: ClassificationMethod;
    variables: string[];
    classSource: string;
    gridResolution: number;
    knnK: number;
    rfNEstimators: number;
    rfMaxDepth: number;
    boundaryPaint: Uint8Array | null;
    boundaryGrid: Float64Array | null;
    gridSize: number;
    boundaryMins: Float64Array | null;
    boundaryMaxs: Float64Array | null;
    predictions: Int16Array | null;
    misclassified: Uint8Array | null;
    classToPaint: number[] | null;
    running: boolean;
    error: string | null;
  };
  setClassificationMethod: (method: ClassificationMethod) => void;
  setClassificationVariables: (vars: string[]) => void;
  setClassificationClassSource: (source: string) => void;
  setClassificationGridResolution: (n: number) => void;
  setClassificationKnnK: (k: number) => void;
  setClassificationRfNEstimators: (n: number) => void;
  setClassificationRfMaxDepth: (d: number) => void;
  runClassification: () => void;
  applyClassificationBoundaries: () => void;
  clearClassification: () => void;
}

export interface ProjectionSlice {
  projection: {
    method: ProjectionMethod;
    variables: string[];
    nComponents: number;
    tsnePerplexity: number;
    tsneIterations: number;
    umapNNeighbors: number;
    umapMinDist: number;
    dimX: number;
    dimY: number;
    embedding: Float64Array | null;
    explainedVar: number[] | null;
    stress: number | null;
    loadings: Float64Array | null;
    varImportance: number[] | null;
    running: boolean;
    error: string | null;
  };
  setProjectionMethod: (method: ProjectionMethod) => void;
  setProjectionVariables: (vars: string[]) => void;
  setProjectionNComponents: (n: number) => void;
  setProjectionDimX: (dim: number) => void;
  setProjectionDimY: (dim: number) => void;
  setProjectionTsnePerplexity: (p: number) => void;
  setProjectionTsneIterations: (i: number) => void;
  setProjectionUmapNNeighbors: (n: number) => void;
  setProjectionUmapMinDist: (d: number) => void;
  runProjection: () => void;
  materializeProjection: () => void;
  clearProjection: () => void;
}

export type AppStore = DataSlice & VariablesSlice & SelectionSlice & BrushSlice & ColorSlice & ToolsSlice & EdgesSlice & HullsSlice & PlotsSlice & TourSlice & MissingSlice & ClusteringSlice & ClassificationSlice & ProjectionSlice;
