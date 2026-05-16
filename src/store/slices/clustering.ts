import type { StateCreator } from "zustand";
import type { AppStore, ClusteringSlice, ClusteringMethod } from "@/store/types";
import type { Linkage } from "@/lib/clustering/hierarchical";
import { kMeans } from "@/lib/clustering/kmeans";
import { agglomerative } from "@/lib/clustering/hierarchical";
import { dbscan } from "@/lib/clustering/dbscan";
import { optics } from "@/lib/clustering/optics";
import type { OpticsResult } from "@/lib/clustering/optics";
import { xMeans } from "@/lib/clustering/xmeans";
import { silhouette } from "@/lib/clustering/silhouette";
import { kDistance } from "@/lib/clustering/kdistance";

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
    dendrogram: null,
    reachability: null,
    ordering: null,
    silhouetteMean: null,
    silhouettePerCluster: null,
    kDistancePlot: null,
  },

  setClusteringMethod: (method: ClusteringMethod) =>
    set((s) => ({ clustering: { ...s.clustering, method, results: null, sizes: [], error: null, dendrogram: null, reachability: null, ordering: null, silhouetteMean: null, silhouettePerCluster: null, kDistancePlot: null } })),

  setClusteringVariables: (variables: string[]) =>
    set((s) => ({ clustering: { ...s.clustering, variables, results: null, sizes: [], error: null, dendrogram: null, reachability: null, ordering: null, silhouetteMean: null, silhouettePerCluster: null, kDistancePlot: null } })),

  setClusteringK: (k: number) =>
    set((s) => ({ clustering: { ...s.clustering, k, results: null, sizes: [], error: null, dendrogram: null, reachability: null, ordering: null, silhouetteMean: null, silhouettePerCluster: null, kDistancePlot: null } })),

  setClusteringLinkage: (linkage: Linkage) =>
    set((s) => ({ clustering: { ...s.clustering, linkage, results: null, sizes: [], error: null, dendrogram: null, reachability: null, ordering: null, silhouetteMean: null, silhouettePerCluster: null, kDistancePlot: null } })),

  setClusteringEps: (eps: number) =>
    set((s) => ({ clustering: { ...s.clustering, eps, results: null, sizes: [], error: null, reachability: null, ordering: null, silhouetteMean: null, silhouettePerCluster: null, kDistancePlot: null } })),

  setClusteringMinPts: (minPts: number) =>
    set((s) => ({ clustering: { ...s.clustering, minPts, results: null, sizes: [], error: null, reachability: null, ordering: null, silhouetteMean: null, silhouettePerCluster: null, kDistancePlot: null } })),

  setClusteringXi: (xi: number) =>
    set((s) => ({ clustering: { ...s.clustering, xi, results: null, sizes: [], error: null, reachability: null, ordering: null, silhouetteMean: null, silhouettePerCluster: null, kDistancePlot: null } })),

  setClusteringKMax: (kMax: number) =>
    set((s) => ({ clustering: { ...s.clustering, kMax, results: null, sizes: [], error: null, silhouetteMean: null, silhouettePerCluster: null, kDistancePlot: null } })),

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
  const dendrogram = method === "hierarchical" ? (result as ReturnType<typeof agglomerative>).dendrogram ?? null : null;
  const reachability = method === "optics" ? (result as OpticsResult).reachability ?? null : null;
  const ordering = method === "optics" ? (result as OpticsResult).ordering ?? null : null;

  const cleanData: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = data[i]!;
    if (row.every((v) => v != null && Number.isFinite(v))) {
      cleanData.push(row as number[]);
    }
  }

  let silhouetteMean: number | null = null;
  let silhouettePerCluster: { id: number; mean: number; size: number }[] | null = null;
  if (effectiveK >= 2 && cleanData.length > 0) {
    const sil = silhouette(cleanData, result);
    silhouetteMean = sil.mean;
    silhouettePerCluster = sil.perCluster;
  }

  let kDistancePlot: Float64Array | null = null;
  if ((method === "dbscan" || method === "optics") && cleanData.length > 0) {
    kDistancePlot = kDistance(cleanData, minPts);
  }

  set((s) => ({
    clustering: {
      ...s.clustering,
      results: result.assignments,
      k: effectiveK,
      sizes: result.sizes,
      running: false,
      dendrogram,
      reachability,
      ordering,
      silhouetteMean,
      silhouettePerCluster,
      kDistancePlot,
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
    dendrogram: null,
    reachability: null,
    ordering: null,
    silhouetteMean: null,
    silhouettePerCluster: null,
    kDistancePlot: null,
  },
    })),
});
