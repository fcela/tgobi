import type { StateCreator } from "zustand";
import type { AppStore, ProjectionSlice } from "@/store/types";
import { pcaProject } from "@/lib/projection/pca";
import { mdsProject } from "@/lib/projection/mds";
import { icaProject } from "@/lib/projection/ica";
import { tsneProject } from "@/lib/projection/tsne";
import { umapProject } from "@/lib/projection/umap";
import type { ProjectionMethod, ProjectionResult } from "@/lib/projection/types";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { makeNumericColumn } from "@/lib/data/columns";
import { bitGet } from "@/lib/brush/hitTest";

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
  },

  setProjectionMethod: (method) =>
    set((s) => ({ projection: { ...s.projection, method, embedding: null, explainedVar: null, stress: null, loadings: null, varImportance: null, error: null } })),

  setProjectionVariables: (variables) =>
    set((s) => ({ projection: { ...s.projection, variables, embedding: null, explainedVar: null, stress: null, loadings: null, varImportance: null, error: null } })),

  setProjectionNComponents: (nComponents) =>
    set((s) => ({ projection: { ...s.projection, nComponents, embedding: null, explainedVar: null, stress: null, loadings: null, varImportance: null, error: null } })),

  setProjectionDimX: (dimX) =>
    set((s) => ({ projection: { ...s.projection, dimX } })),

  setProjectionDimY: (dimY) =>
    set((s) => ({ projection: { ...s.projection, dimY } })),

  setProjectionTsnePerplexity: (tsnePerplexity) =>
    set((s) => ({ projection: { ...s.projection, tsnePerplexity, embedding: null, error: null } })),

  setProjectionTsneIterations: (tsneIterations) =>
    set((s) => ({ projection: { ...s.projection, tsneIterations, embedding: null, error: null } })),

  setProjectionUmapNNeighbors: (umapNNeighbors) =>
    set((s) => ({ projection: { ...s.projection, umapNNeighbors, embedding: null, error: null } })),

  setProjectionUmapMinDist: (umapMinDist) =>
    set((s) => ({ projection: { ...s.projection, umapMinDist, embedding: null, error: null } })),

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

    setTimeout(() => {
    try {
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

      let result: ProjectionResult;
      switch (method as ProjectionMethod) {
        case "pca":
          result = pcaProject(usedData, usedN, p, nComponents);
          break;
        case "mds":
          result = mdsProject(usedData, usedN, p, nComponents);
          break;
        case "ica":
          result = icaProject(usedData, usedN, p, nComponents);
          break;
        case "tsne":
          result = tsneProject(usedData, usedN, p, nComponents, tsnePerplexity, tsneIterations);
          break;
        case "umap":
          result = umapProject(usedData, usedN, p, nComponents, umapNNeighbors, umapMinDist);
          break;
        default:
          throw new Error(`Unknown projection method: ${method}`);
      }

      const fullEmbedding = new Float64Array(df.nrow * result.nComponents);
      for (let i = 0; i < n; i++) {
        for (let c = 0; c < result.nComponents; c++) {
          fullEmbedding[rows[i]! * result.nComponents + c] = result.embedding[i * result.nComponents + c]!;
        }
      }

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
          },
        }));
    } catch (e) {
      set((s) => ({
        projection: {
          ...s.projection,
          running: false,
          error: e instanceof Error ? e.message : String(e),
        },
      }));
    }
    }, 0);
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
      },
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
