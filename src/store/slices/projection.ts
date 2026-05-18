import type { StateCreator } from "zustand";
import type { AppStore, ProjectionSlice } from "@/store/types";
import type { ProjectionMethod, ProjectionResult } from "@/lib/projection/types";
import { pcaProject } from "@/lib/projection/pca";
import { mdsProject } from "@/lib/projection/mds";
import { icaProject } from "@/lib/projection/ica";
import { tsneProject } from "@/lib/projection/tsne";
import { umapProject } from "@/lib/projection/umap";
import { computeDRQuality } from "@/lib/projection/quality";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeNumericColumn } from "@/lib/data/columns";
import { bitGet } from "@/lib/brush/hitTest";
import { procrustesAlign } from "@/lib/projection/procrustes";

let ProjWorkerClass: (new () => Worker) | null = null;
let projWorkerLoaded = false;
async function loadProjWorker(): Promise<(new () => Worker) | null> {
  if (projWorkerLoaded) return ProjWorkerClass;
  projWorkerLoaded = true;
  if (typeof Worker === "undefined") return null;
  try {
    const mod = await import("@/workers/projection.worker.ts?worker");
    ProjWorkerClass = mod.default;
    return ProjWorkerClass;
  } catch {
    return null;
  }
}

function projectSync(
  method: ProjectionMethod,
  data: Float64Array,
  n: number,
  p: number,
  nComponents: number,
  tsnePerplexity: number,
  tsneIterations: number,
  umapNNeighbors: number,
  umapMinDist: number,
): ProjectionResult {
  switch (method) {
    case "pca": return pcaProject(data, n, p, nComponents);
    case "mds": return mdsProject(data, n, p, nComponents);
    case "ica": return icaProject(data, n, p, nComponents);
    case "tsne": return tsneProject(data, n, p, nComponents, tsnePerplexity, tsneIterations);
    case "umap": return umapProject(data, n, p, nComponents, umapNNeighbors, umapMinDist);
    default: throw new Error(`Unknown projection method: ${method}`);
  }
}

function compareDRSync(
  data: Float64Array,
  n: number,
  p: number,
  tsnePerplexity: number,
  tsneIterations: number,
  umapNNeighbors: number,
  umapMinDist: number,
): { label: string; embedding: Float64Array }[] {
  const refEmbed = pcaProject(data, n, p, 2).embedding;
  const methods: { key: ProjectionMethod; label: string; fn: () => Float64Array }[] = [
    { key: "pca", label: "PCA", fn: () => refEmbed },
    { key: "mds", label: "MDS", fn: () => mdsProject(data, n, p, 2).embedding },
    { key: "ica", label: "ICA", fn: () => icaProject(data, n, p, 2).embedding },
    { key: "tsne", label: "t-SNE", fn: () => tsneProject(data, n, p, 2, tsnePerplexity, tsneIterations).embedding },
    { key: "umap", label: "UMAP", fn: () => umapProject(data, n, p, 2, umapNNeighbors, umapMinDist).embedding },
  ];
  const morphEmbeddings: { label: string; embedding: Float64Array }[] = [];
  for (const { key, label, fn } of methods) {
    let embed: Float64Array;
    if (key === "pca") {
      embed = refEmbed;
    } else {
      const rawEmbed = fn();
      embed = procrustesAlign(refEmbed, rawEmbed, n);
    }
    morphEmbeddings.push({ label, embedding: embed });
  }
  return morphEmbeddings;
}

type WorkerOutMessage =
  | { kind: "result"; result: ProjectionResult }
  | { kind: "compareResult"; morphEmbeddings: { label: string; embedding: Float64Array }[] }
  | { kind: "error"; error: string };

export const createProjectionSlice: StateCreator<AppStore, [], [], ProjectionSlice> = (set, get) => ({
  projection: {
    method: "pca",
    variables: [],
    nComponents: 2,
    tsnePerplexity: 30,
    tsneIterations: 500,
    umapNNeighbors: 15,
    umapMinDist: 0.1,
    dimX: 1,
    dimY: 2,
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

  setProjectionMethod: (method) =>
    set((s) => ({ projection: { ...s.projection, method, embedding: null, explainedVar: null, stress: null, loadings: null, varImportance: null, error: null, quality: null } })),

  setProjectionVariables: (variables) =>
    set((s) => ({ projection: { ...s.projection, variables, embedding: null, explainedVar: null, stress: null, loadings: null, varImportance: null, error: null, quality: null } })),

  setProjectionNComponents: (nComponents) =>
    set((s) => ({ projection: { ...s.projection, nComponents, embedding: null, explainedVar: null, stress: null, loadings: null, varImportance: null, error: null, quality: null } })),

  setProjectionDimX: (dimX) =>
    set((s) => ({ projection: { ...s.projection, dimX } })),

  setProjectionDimY: (dimY) =>
    set((s) => ({ projection: { ...s.projection, dimY } })),

  setProjectionTsnePerplexity: (tsnePerplexity) =>
    set((s) => ({ projection: { ...s.projection, tsnePerplexity, embedding: null, error: null, quality: null } })),

  setProjectionTsneIterations: (tsneIterations) =>
    set((s) => ({ projection: { ...s.projection, tsneIterations, embedding: null, error: null, quality: null } })),

  setProjectionUmapNNeighbors: (umapNNeighbors) =>
    set((s) => ({ projection: { ...s.projection, umapNNeighbors, embedding: null, error: null, quality: null } })),

  setProjectionUmapMinDist: (umapMinDist) =>
    set((s) => ({ projection: { ...s.projection, umapMinDist, embedding: null, error: null, quality: null } })),

  runProjection: () => {
    const { df } = get();
    const { method, variables, nComponents, tsnePerplexity, tsneIterations, umapNNeighbors, umapMinDist } = get().projection;
    const { shadow } = get().selection;

    if (!df || variables.length < 2) {
      set((s) => ({ projection: { ...s.projection, error: "Need data and 2+ variables" } }));
      return;
    }

    const p = variables.length;
    const columns = variables.map((name) => df.column(name));

    for (const col of columns) {
      if (!col || (col.type !== "numeric" && col.type !== "integer")) {
        set((s) => ({ projection: { ...s.projection, error: `Variable "${col?.name ?? "?"}" is not numeric` } }));
        return;
      }
    }

    set((s) => ({ projection: { ...s.projection, running: true, error: null } }));

    const rows: number[] = [];
    for (let i = 0; i < df.nrow; i++) {
      if (bitGet(shadow, i)) continue;
      let valid = true;
      for (const col of columns) {
        if (col!.missing.isMissing(i)) { valid = false; break; }
      }
      if (valid) rows.push(i);
    }

    if (rows.length < 3) {
      set((s) => ({ projection: { ...s.projection, running: false, error: "Need at least 3 non-shadowed complete rows" } }));
      return;
    }

    const n = rows.length;
    const data = new Float64Array(n * p);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < p; j++) {
        const col = columns[j]!;
        const val = col.type === "integer" ? col.values[rows[i]!] : col.type === "numeric" ? col.values[rows[i]!] : 0;
        data[i * p + j] = val ?? 0;
      }
    }

    const maxN = method === "mds" ? 2000 : n;
    const usedData = n > maxN ? subsampleRows(data, n, p, maxN) : data;
    const usedN = Math.min(n, maxN);

    loadProjWorker().then((WorkerClass) => {
      if (WorkerClass) {
        const worker = new WorkerClass() as Worker;
        worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
          worker.terminate();
          const msg = e.data;
          if (msg.kind === "error") {
            set((s) => ({ projection: { ...s.projection, running: false, error: msg.error } }));
            return;
          }
          if (msg.kind === "result") {
            finishProjection(msg.result);
          }
        };
        worker.onerror = (err) => {
          worker.terminate();
          set((s) => ({ projection: { ...s.projection, running: false, error: err.message } }));
        };
        const dataCopy = new Float64Array(usedData);
        worker.postMessage({
          kind: "project",
          data: dataCopy, n: usedN, p, nComponents, method,
          tsnePerplexity, tsneIterations, umapNNeighbors, umapMinDist,
        }, [dataCopy.buffer]);
      } else {
        setTimeout(() => {
          try {
            const result = projectSync(method, usedData, usedN, p, nComponents, tsnePerplexity, tsneIterations, umapNNeighbors, umapMinDist);
            finishProjection(result);
          } catch (e) {
            set((s) => ({ projection: { ...s.projection, running: false, error: e instanceof Error ? e.message : String(e) } }));
          }
        }, 0);
      }
    });

    function finishProjection(result: ProjectionResult) {
      if (!df) return;
      const fullEmbedding = new Float64Array(df.nrow * result.nComponents);
      for (let i = 0; i < n; i++) {
        for (let c = 0; c < result.nComponents; c++) {
          fullEmbedding[rows[i]! * result.nComponents + c] = result.embedding[i * result.nComponents + c]!;
        }
      }

      let quality: import("@/store/types").ProjectionQuality | null = null;
      try {
        const qm = computeDRQuality(usedData, result.embedding, usedN, p, result.nComponents);
        quality = {
          trustworthiness: qm.trustworthiness,
          continuity: qm.continuity,
          shepardOrigDists: qm.shepardOrigDists,
          shepardEmbDists: qm.shepardEmbDists,
        };
      } catch { /* quality computation is best-effort */ }

      set((s) => ({
        projection: {
          ...s.projection,
          embedding: fullEmbedding,
          explainedVar: result.explainedVar,
          stress: result.stress,
          loadings: result.loadings,
          varImportance: result.varImportance,
          nComponents: result.nComponents,
          running: false,
          quality,
        },
      }));
    }
  },

  materializeProjection: () => {
    const { df } = get();
    const { method, embedding, nComponents, dimX, dimY } = get().projection;
    if (!df || !embedding) return;

    const methodLabel = methodLabelMap[method] ?? method.toUpperCase();
    const dimNames = Array.from({ length: nComponents }, (_, i) => `${methodLabel}.${i + 1}`);

    const newColumns = [...df.columns];
    for (let c = 0; c < nComponents; c++) {
      const values = new Float64Array(df.nrow);
      for (let i = 0; i < df.nrow; i++) {
        values[i] = embedding[i * nComponents + c]!;
      }
      newColumns.push(makeNumericColumn(dimNames[c]!, values));
    }

    const newDf = new ArrayDataFrame(newColumns);

    set((s) => ({
      df: newDf,
      projection: { ...s.projection },
      spec: [
        ...s.spec,
        ...dimNames.map((name) => ({
          name,
          type: "numeric" as const,
          included: true,
        })),
      ],
    }));

    const xName = dimNames[dimX - 1]!;
    const yName = dimNames[dimY - 1]!;
    get().addScatter(xName, yName);
  },

  clearProjection: () =>
    set(() => ({
      projection: {
        method: "pca",
        variables: [],
        nComponents: 2,
        tsnePerplexity: 30,
        tsneIterations: 500,
        umapNNeighbors: 15,
        umapMinDist: 0.1,
        dimX: 1,
        dimY: 2,
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
    })),

  compareDR: () => {
    const { df } = get();
    const { variables, tsnePerplexity, tsneIterations, umapNNeighbors, umapMinDist } = get().projection;
    const { shadow } = get().selection;

    const vars = variables.length >= 2 ? variables : (get().tour.activeVars.length >= 2 ? get().tour.activeVars : variables);

    if (!df || vars.length < 2) {
      set((s) => ({ projection: { ...s.projection, error: "Need data and 2+ variables" } }));
      return;
    }

    set((s) => ({ projection: { ...s.projection, running: true, error: null } }));

    const p = vars.length;
    const columns = vars.map((name) => df.column(name));
    for (const col of columns) {
      if (!col || (col.type !== "numeric" && col.type !== "integer")) {
        set((s) => ({ projection: { ...s.projection, running: false, error: `Variable "${col?.name ?? "?"}" is not numeric` } }));
        return;
      }
    }

    const rows: number[] = [];
    for (let i = 0; i < df.nrow; i++) {
      if (bitGet(shadow, i)) continue;
      let valid = true;
      for (const col of columns) {
        if (col!.missing.isMissing(i)) { valid = false; break; }
      }
      if (valid) rows.push(i);
    }

    if (rows.length < 4) {
      set((s) => ({ projection: { ...s.projection, running: false, error: "Need at least 4 non-shadowed complete rows" } }));
      return;
    }

    const n = rows.length;
    const data = new Float64Array(n * p);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < p; j++) {
        const col = columns[j]!;
        const val = col.type === "integer" ? col.values[rows[i]!] : col.type === "numeric" ? col.values[rows[i]!] : 0;
        data[i * p + j] = val ?? 0;
      }
    }

    const usedN = Math.min(n, 2000);
    const usedData = n > 2000 ? subsampleRows(data, n, p, 2000) : data;

    loadProjWorker().then((WorkerClass) => {
      if (WorkerClass) {
        const worker = new WorkerClass() as Worker;
        worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
          worker.terminate();
          const msg = e.data;
          if (msg.kind === "error") {
            set((s) => ({ projection: { ...s.projection, running: false, error: msg.error } }));
            return;
          }
          if (msg.kind === "compareResult") {
            const morphEmbeddings: { label: string; embedding: Float64Array }[] = [];
            for (const me of msg.morphEmbeddings) {
              const fullEmbed = new Float64Array(df!.nrow * 2);
              for (let i = 0; i < n; i++) {
                fullEmbed[rows[i]! * 2] = me.embedding[i * 2]!;
                fullEmbed[rows[i]! * 2 + 1] = me.embedding[i * 2 + 1]!;
              }
              morphEmbeddings.push({ label: me.label, embedding: fullEmbed });
            }
            set((s) => ({
              projection: {
                ...s.projection,
                running: false,
                morphEmbeddings,
                morphIndex: 0,
                morphT: 0,
                morphPlaying: false,
              },
            }));
          }
        };
        worker.onerror = (err) => {
          worker.terminate();
          set((s) => ({ projection: { ...s.projection, running: false, error: err.message } }));
        };
        const dataCopy = new Float64Array(usedData);
        worker.postMessage({
          kind: "compareDR",
          data: dataCopy, n: usedN, p,
          tsnePerplexity, tsneIterations, umapNNeighbors, umapMinDist,
        }, [dataCopy.buffer]);
      } else {
        setTimeout(() => {
          try {
            const raw = compareDRSync(usedData, usedN, p, tsnePerplexity, tsneIterations, umapNNeighbors, umapMinDist);
            const morphEmbeddings: { label: string; embedding: Float64Array }[] = [];
            for (const me of raw) {
              const fullEmbed = new Float64Array(df.nrow * 2);
              for (let i = 0; i < n; i++) {
                fullEmbed[rows[i]! * 2] = me.embedding[i * 2]!;
                fullEmbed[rows[i]! * 2 + 1] = me.embedding[i * 2 + 1]!;
              }
              morphEmbeddings.push({ label: me.label, embedding: fullEmbed });
            }
            set((s) => ({
              projection: {
                ...s.projection,
                running: false,
                morphEmbeddings,
                morphIndex: 0,
                morphT: 0,
                morphPlaying: false,
              },
            }));
          } catch (e) {
            set((s) => ({
              projection: { ...s.projection, running: false, error: e instanceof Error ? e.message : String(e) },
            }));
          }
        }, 0);
      }
    });
  },

  setMorphIndex: (i) => set((s) => ({ projection: { ...s.projection, morphIndex: i, morphT: 0 } })),

  setMorphT: (t) => set((s) => ({ projection: { ...s.projection, morphT: t } })),

  setMorphPlaying: (playing) => set((s) => ({ projection: { ...s.projection, morphPlaying: playing } })),

  stopMorph: () => set((s) => ({
    projection: { ...s.projection, morphPlaying: false, morphT: 0, morphIndex: 0 },
  })),
});

const methodLabelMap: Record<ProjectionMethod, string> = {
  pca: "PCA",
  mds: "MDS",
  tsne: "tSNE",
  umap: "UMAP",
  ica: "ICA",
};

function subsampleRows(data: Float64Array, n: number, p: number, maxN: number): Float64Array {
  const step = n / maxN;
  const out = new Float64Array(maxN * p);
  for (let i = 0; i < maxN; i++) {
    const src = Math.floor(i * step);
    for (let j = 0; j < p; j++) {
      out[i * p + j] = data[src * p + j]!;
    }
  }
  return out;
}
