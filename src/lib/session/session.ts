import type { AppStore } from "@/store/types";
import type { Column, DataFrame } from "@/lib/data/types";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { DEFAULT_MAPPER_PARAMS } from "@/lib/mapper";
import {
  makeNumericColumn,
  makeIntegerColumn,
  makeCategoricalColumn,
  makeDateColumn,
} from "@/lib/data/columns";
import { BitMissingMask } from "@/lib/data/missing";

export interface SessionFile {
  version: 1;
  data: SerializedDataFrame;
  state: SerializedState;
}

export interface SerializedDataFrame {
  columns: SerializedColumn[];
  nrow: number;
}

export type SerializedColumn =
  | { type: "numeric"; name: string; values: number[]; missing: number[] }
  | { type: "integer"; name: string; values: number[]; missing: number[] }
  | { type: "categorical"; name: string; codes: number[]; levels: string[]; missing: number[] }
  | { type: "date"; name: string; values: number[]; missing: number[] };

export interface SerializedState {
  spec: AppStore["spec"];
  selection: {
    paint: number[];
    shape: number[];
    shadow: number[];
  };
  brush: AppStore["brush"];
  color: AppStore["color"];
  tools: {
    active: AppStore["tools"]["active"];
    labelVar: string | null;
  };
  hulls: AppStore["hulls"];
  tour: {
    shape: AppStore["tour"]["shape"];
    mode: AppStore["tour"]["mode"];
    ppIndex: AppStore["tour"]["ppIndex"];
    speed: AppStore["tour"]["speed"];
    activeVars: string[];
    activeXVars: string[];
    activeYVars: string[];
    frozenVars: string[];
    manualVar: string | null;
    manualValue: number;
    ppClassSource: AppStore["tour"]["ppClassSource"];
    langevinStep: number;
    langevinDiffusion: number;
  };
  missing: AppStore["missing"];
  clustering: {
    method: AppStore["clustering"]["method"];
    variables: string[];
    k: number;
    linkage: AppStore["clustering"]["linkage"];
    eps: number;
    minPts: number;
    xi: number;
    kMax: number;
  };
classification: {
  method: AppStore["classification"]["method"];
  variables: string[]; classSource: string; gridResolution: number;
  gridMode: AppStore["classification"]["gridMode"];
  knnK: number; rfNEstimators: number; rfMaxDepth: number;
  lrLambda: number; lrMaxIter: number; trainRatio: number;
  useTrainTestSplit: boolean; indecisionThreshold: number;
};
  projection: {
    method: AppStore["projection"]["method"];
    variables: string[];
    nComponents: number;
    tsnePerplexity: number;
    tsneIterations: number;
    umapNNeighbors: number;
    umapMinDist: number;
    dimX: number;
    dimY: number;
  };
  scagnostics: {
    variables: string[];
    sortMeasure: AppStore["scagnostics"]["sortMeasure"];
    sortDescending: boolean;
    filterMeasure: AppStore["scagnostics"]["filterMeasure"];
    filterThreshold: number;
    scatmatReorderBy: AppStore["scagnostics"]["scatmatReorderBy"];
    scatmatReorderDescending: boolean;
  };
  mapper: {
    params: AppStore["mapper"]["params"];
    colorBy: string;
  };
}

function serializeColumn(col: Column): SerializedColumn {
  const missingBits: number[] = [];
  for (let i = 0; i < col.length; i++) {
    missingBits.push(col.missing.isMissing(i) ? 1 : 0);
  }
  switch (col.type) {
    case "numeric":
      return { type: "numeric", name: col.name, values: Array.from(col.values), missing: missingBits };
    case "integer":
      return { type: "integer", name: col.name, values: Array.from(col.values), missing: missingBits };
    case "categorical":
      return { type: "categorical", name: col.name, codes: Array.from(col.codes), levels: [...col.levels], missing: missingBits };
    case "date":
      return { type: "date", name: col.name, values: Array.from(col.values), missing: missingBits };
  }
}

function deserializeColumn(sc: SerializedColumn): Column {
  const len = sc.type === "categorical" ? sc.codes.length : sc.values.length;
  const missing = new BitMissingMask(len);
  for (let i = 0; i < sc.missing.length; i++) {
    if (sc.missing[i]) missing.setMissing(i, true);
  }
  switch (sc.type) {
    case "numeric":
      return makeNumericColumn(sc.name, Float64Array.from(sc.values), missing);
    case "integer":
      return makeIntegerColumn(sc.name, Int32Array.from(sc.values), missing);
    case "categorical":
      return makeCategoricalColumn(sc.name, Int32Array.from(sc.codes), sc.levels, missing);
    case "date":
      return makeDateColumn(sc.name, Float64Array.from(sc.values), missing);
  }
}

function serializeDataFrame(df: DataFrame): SerializedDataFrame {
  return {
    columns: df.columns.map(serializeColumn),
    nrow: df.nrow,
  };
}

function deserializeDataFrame(sdf: SerializedDataFrame): DataFrame {
  const columns = sdf.columns.map(deserializeColumn);
  return new ArrayDataFrame(columns);
}

export function exportSession(store: AppStore): SessionFile {
  const { df } = store;
  if (!df) throw new Error("No data loaded");

  return {
    version: 1,
    data: serializeDataFrame(df),
    state: {
      spec: store.spec,
      selection: {
        paint: Array.from(store.selection.paint),
        shape: Array.from(store.selection.shape),
        shadow: Array.from(store.selection.shadow),
      },
      brush: store.brush,
      color: store.color,
      tools: {
        active: store.tools.active,
        labelVar: store.tools.labelVar,
      },
      hulls: store.hulls,
      tour: {
        shape: store.tour.shape,
        mode: store.tour.mode,
        ppIndex: store.tour.ppIndex,
        speed: store.tour.speed,
        activeVars: store.tour.activeVars,
        activeXVars: store.tour.activeXVars,
        activeYVars: store.tour.activeYVars,
        frozenVars: store.tour.frozenVars,
        manualVar: store.tour.manualVar,
        manualValue: store.tour.manualValue,
        ppClassSource: store.tour.ppClassSource,
        langevinStep: store.tour.langevinStep,
        langevinDiffusion: store.tour.langevinDiffusion,
      },
      missing: store.missing,
      clustering: {
        method: store.clustering.method,
        variables: store.clustering.variables,
        k: store.clustering.k,
        linkage: store.clustering.linkage,
        eps: store.clustering.eps,
        minPts: store.clustering.minPts,
        xi: store.clustering.xi,
        kMax: store.clustering.kMax,
      },
      classification: {
        method: store.classification.method,
        variables: store.classification.variables,
        classSource: store.classification.classSource,
        gridResolution: store.classification.gridResolution,
        gridMode: store.classification.gridMode,
        knnK: store.classification.knnK,
        rfNEstimators: store.classification.rfNEstimators,
        rfMaxDepth: store.classification.rfMaxDepth,
        lrLambda: store.classification.lrLambda,
        lrMaxIter: store.classification.lrMaxIter,
    trainRatio: store.classification.trainRatio,
    useTrainTestSplit: store.classification.useTrainTestSplit,
    indecisionThreshold: store.classification.indecisionThreshold,
  },
      projection: {
        method: store.projection.method,
        variables: store.projection.variables,
        nComponents: store.projection.nComponents,
        tsnePerplexity: store.projection.tsnePerplexity,
        tsneIterations: store.projection.tsneIterations,
        umapNNeighbors: store.projection.umapNNeighbors,
        umapMinDist: store.projection.umapMinDist,
        dimX: store.projection.dimX,
        dimY: store.projection.dimY,
      },
  scagnostics: {
    variables: store.scagnostics.variables,
    sortMeasure: store.scagnostics.sortMeasure,
    sortDescending: store.scagnostics.sortDescending,
    filterMeasure: store.scagnostics.filterMeasure,
    filterThreshold: store.scagnostics.filterThreshold,
    scatmatReorderBy: store.scagnostics.scatmatReorderBy,
    scatmatReorderDescending: store.scagnostics.scatmatReorderDescending,
  },
      mapper: {
        params: store.mapper.params,
        colorBy: store.mapper.colorBy,
      },
    },
  };
}

export function importSession(file: SessionFile): { df: DataFrame; state: Partial<AppStore> } {
  const df = deserializeDataFrame(file.data);
  const s = file.state;

  const selectionPaint = Uint8Array.from(s.selection.paint);
  const selectionShape = Uint8Array.from(s.selection.shape);
  const selectionShadow = Uint8Array.from(s.selection.shadow);

  return {
    df,
    state: {
      spec: s.spec,
      selection: {
        mask: new Uint8Array(Math.ceil(df.nrow / 8)),
        paint: selectionPaint,
        shape: selectionShape,
        shadow: selectionShadow,
      },
      brush: s.brush,
      color: s.color,
      tools: {
        active: s.tools.active,
        hoverRow: null,
        pinnedRows: new Uint8Array(df.nrow),
        labelVar: s.tools.labelVar,
      },
      hulls: s.hulls,
      tour: {
        activePanelId: null,
        shape: s.tour.shape,
        mode: s.tour.mode,
        ppIndex: s.tour.ppIndex,
        ppValue: null,
        isPlaying: false,
        speed: s.tour.speed,
        activeVars: s.tour.activeVars,
        activeXVars: s.tour.activeXVars ?? [],
        activeYVars: s.tour.activeYVars ?? [],
        frozenVars: s.tour.frozenVars,
        manualVar: s.tour.manualVar,
        manualValue: s.tour.manualValue,
        basis: null,
        proj: null,
        t: 0,
        savedViews: [],
        nextViewId: 0,
        keyframes: [],
        nextKeyframeId: 0,
        scrubberT: 0,
        scrubbing: false,
        langevinStep: s.tour.langevinStep,
        langevinDiffusion: s.tour.langevinDiffusion,
        ppScoreTrace: [],
        ppClassSource: s.tour.ppClassSource,
      },
      missing: s.missing,
      clustering: {
        method: s.clustering.method,
        variables: s.clustering.variables,
        k: s.clustering.k,
        linkage: s.clustering.linkage,
        eps: s.clustering.eps,
        minPts: s.clustering.minPts,
        xi: s.clustering.xi,
        kMax: s.clustering.kMax,
        results: null,
        sizes: [],
        running: false,
        error: null,
        dendrogram: null,
        reachability: null,
        ordering: null,
        silhouetteMean: null,
        silhouettePerCluster: null,
        kDistancePlot: null,
      },
      classification: {
        method: s.classification.method,
        variables: s.classification.variables,
        classSource: s.classification.classSource,
        gridResolution: s.classification.gridResolution,
        gridMode: s.classification.gridMode ?? "2d",
        effectiveGridResolution: 0,
        gridTotal: 0,
        knnK: s.classification.knnK,
        rfNEstimators: s.classification.rfNEstimators,
        rfMaxDepth: s.classification.rfMaxDepth,
        lrLambda: s.classification.lrLambda,
        lrMaxIter: s.classification.lrMaxIter,
        trainRatio: s.classification.trainRatio,
    useTrainTestSplit: s.classification.useTrainTestSplit,
    indecisionThreshold: s.classification.indecisionThreshold ?? 0,
    boundaryPaint: null,
        boundaryGrid: null,
        boundaryVars: null,
        gridSize: 0,
        boundaryMins: null,
        boundaryMaxs: null,
    boundariesVisible: false,
    boundaryProbabilities: null,
        predictions: null,
        misclassified: null,
        classToPaint: null,
        running: false,
        error: null,
        confusionMatrix: null,
        classLabels: null,
        accuracy: null,
        perClassMetrics: null,
        featureImportance: null,
        cvResult: null,
      },
      projection: {
        method: s.projection.method,
        variables: s.projection.variables,
        nComponents: s.projection.nComponents,
        tsnePerplexity: s.projection.tsnePerplexity,
        tsneIterations: s.projection.tsneIterations,
        umapNNeighbors: s.projection.umapNNeighbors,
        umapMinDist: s.projection.umapMinDist,
        dimX: s.projection.dimX,
        dimY: s.projection.dimY,
        embedding: null,
        explainedVar: null,
        stress: null,
        loadings: null,
        varImportance: null,
        running: false,
        error: null,
        morphEmbeddings: null,
        morphIndex: 0,
        morphT: 0,
        morphPlaying: false,
        quality: null,
      },
    scagnostics: {
      variables: s.scagnostics.variables,
      results: null,
      running: false,
      error: null,
      sortMeasure: s.scagnostics.sortMeasure,
      sortDescending: s.scagnostics.sortDescending,
      filterMeasure: s.scagnostics.filterMeasure,
      filterThreshold: s.scagnostics.filterThreshold,
      scatmatReorderBy: s.scagnostics.scatmatReorderBy ?? null,
      scatmatReorderDescending: s.scagnostics.scatmatReorderDescending ?? true,
    },
    mapper: {
      // Merge with defaults so sessions saved before clusterMethod /
      // clusterLinkage / clusterEps / clusterMinPts existed still load cleanly.
      params: { ...DEFAULT_MAPPER_PARAMS, ...s.mapper.params },
      graph: null,
      running: false,
      error: null,
      colorBy: s.mapper.colorBy,
      selectedNodeId: null,
      sweepResults: null,
      sweepRunning: false,
    },
    },
  };
}

export function downloadSession(store: AppStore): void {
  const session = exportSession(store);
  const json = JSON.stringify(session);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tgobi-session.json";
  a.click();
  URL.revokeObjectURL(url);
}

export async function loadSessionFromFile(): Promise<SessionFile> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { reject(new Error("No file selected")); return; }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string);
          if (parsed.version !== 1) { reject(new Error("Unsupported session version")); return; }
          resolve(parsed as SessionFile);
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(new Error("File read error"));
      reader.readAsText(file);
    };
    input.click();
  });
}
