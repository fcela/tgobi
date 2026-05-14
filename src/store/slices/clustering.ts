import type { StateCreator } from "zustand";
import type { AppStore, ClusteringSlice, ClusteringMethod } from "@/store/types";
import type { Linkage } from "@/lib/clustering/hierarchical";
import { kMeans } from "@/lib/clustering/kmeans";
import { agglomerative } from "@/lib/clustering/hierarchical";
import { dbscan } from "@/lib/clustering/dbscan";
import { optics } from "@/lib/clustering/optics";
import { xMeans } from "@/lib/clustering/xmeans";

export const createClusteringSlice: StateCreator<AppStore, [], [], ClusteringSlice> = (set, get) => ({
  clustering: {
    method: "kmeans",
    variables: [],
    k: 3,
    linkage: "complete",
    eps: 1,
    minPts: 5,
    xi: 0.05,
    kMax: 10,
    results: null,
    sizes: [],
    running: false,
    error: null,
  },

  setClusteringMethod: (method: ClusteringMethod) =>
    set((s) => ({ clustering: { ...s.clustering, method, results: null, sizes: [], error: null } })),

  setClusteringVariables: (variables: string[]) =>
    set((s) => ({ clustering: { ...s.clustering, variables, results: null, sizes: [], error: null } })),

  setClusteringK: (k: number) =>
    set((s) => ({ clustering: { ...s.clustering, k, results: null, sizes: [], error: null } })),

  setClusteringLinkage: (linkage: Linkage) =>
    set((s) => ({ clustering: { ...s.clustering, linkage, results: null, sizes: [], error: null } })),

  setClusteringEps: (eps: number) =>
    set((s) => ({ clustering: { ...s.clustering, eps, results: null, sizes: [], error: null } })),

  setClusteringMinPts: (minPts: number) =>
    set((s) => ({ clustering: { ...s.clustering, minPts, results: null, sizes: [], error: null } })),

  setClusteringXi: (xi: number) =>
    set((s) => ({ clustering: { ...s.clustering, xi, results: null, sizes: [], error: null } })),

  setClusteringKMax: (kMax: number) =>
    set((s) => ({ clustering: { ...s.clustering, kMax, results: null, sizes: [], error: null } })),

  runClustering: () => {
    const { df } = get();
    const { method, variables, k, linkage, eps, minPts, xi, kMax } = get().clustering;
    if (!df || variables.length < 2) {
      set((s) => ({ clustering: { ...s.clustering, error: "Need data and 2+ variables" } }));
      return;
    }
    if ((method === "kmeans" || method === "hierarchical") && k < 2) {
      set((s) => ({ clustering: { ...s.clustering, error: "Need k>=2" } }));
      return;
    }

    set((s) => ({ clustering: { ...s.clustering, running: true, error: null } }));

    try {
      const columns = variables.map((name) => df.column(name));
      const n = df.nrow;
      const p = variables.length;
      const data: (number | null)[][] = [];
      for (let i = 0; i < n; i++) {
        const row: (number | null)[] = [];
        for (let j = 0; j < p; j++) {
          const col = columns[j];
          if (!col) { row.push(null); continue; }
          if (col.type === "categorical") { row.push(null); continue; }
          const isMissing = col.missing.isMissing(i);
          if (isMissing) { row.push(null); continue; }
          const val = col.type === "integer" ? col.values[i] : col.type === "numeric" ? col.values[i] : col.type === "date" ? col.values[i] : null;
          if (val == null || !Number.isFinite(val)) { row.push(null); }
          else { row.push(val); }
        }
        data.push(row);
      }

      const result = method === "kmeans"
        ? kMeans(data, k)
        : method === "hierarchical"
        ? agglomerative(data, k, linkage)
        : method === "dbscan"
        ? dbscan(data, eps, minPts)
        : method === "optics"
        ? optics(data, eps, minPts, xi)
        : xMeans(data, kMax);

      const effectiveK = method === "xmeans" ? (result as ReturnType<typeof xMeans>).k : result.k;

      set((s) => ({
        clustering: {
          ...s.clustering,
          results: result.assignments,
          k: effectiveK,
          sizes: result.sizes,
          running: false,
        },
      }));
    } catch (e) {
      set((s) => ({
        clustering: {
          ...s.clustering,
          running: false,
          error: e instanceof Error ? e.message : String(e),
        },
      }));
    }
  },

  applyClusteringPaint: () => {
    const { results, k: usedK } = get().clustering;
    const { df, selection } = get();
    if (!results || !df) return;

    const paint = new Uint8Array(df.nrow);
    for (let i = 0; i < df.nrow; i++) {
      const cluster = results[i]!;
      if (cluster >= 0 && cluster < usedK) {
        paint[i] = cluster + 1;
      } else {
        paint[i] = selection.paint[i] ?? 0;
      }
    }
    set((s) => ({ selection: { ...s.selection, paint } }));
  },

  clearClustering: () =>
    set(() => ({
      clustering: {
        method: "kmeans",
        variables: [],
        k: 3,
        linkage: "complete",
        eps: 1,
        minPts: 5,
        xi: 0.05,
        kMax: 10,
        results: null,
        sizes: [],
        running: false,
        error: null,
      },
    })),
});
