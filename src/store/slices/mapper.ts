import type { StateCreator } from "zustand";
import type { AppStore, MapperSlice } from "@/store/types";
import { computeMapper, DEFAULT_MAPPER_PARAMS, type FilterFunction, type MapperClusterMethod, type MapperClusterLinkage } from "@/lib/mapper";
import type { MapperGraph, MapperParams } from "@/lib/mapper";
import { mapperSweep, type SweepResult } from "@/lib/mapper/sweep";
import { resolveScaledValues } from "@/lib/data/resolveScaling";
import { bitGet } from "@/lib/brush/hitTest";

let MapperWorkerClass: (new () => Worker) | null = null;
let mapperWorkerLoaded = false;
async function loadMapperWorker(): Promise<(new () => Worker) | null> {
  if (mapperWorkerLoaded) return MapperWorkerClass;
  mapperWorkerLoaded = true;
  if (typeof Worker === "undefined") return null;
  try {
    const mod = await import("@/workers/mapper.worker.ts?worker");
    MapperWorkerClass = mod.default;
    return MapperWorkerClass;
  } catch {
    return null;
  }
}

interface FilterResult {
  values: Float64Array;
  missing: Uint8Array;
}

function resolveFilter(
  df: import("@/lib/data/types").DataFrame,
  spec: import("@/types").VarSpec[],
  dataCols: Array<{ values: Float64Array | Int32Array; missing: Uint8Array; name: string }>,
  params: MapperParams,
): FilterResult | null {
  if (params.filter === "variable" && params.filterVar) {
    const col = df.column(params.filterVar);
    if (!col || (col.type !== "numeric" && col.type !== "integer")) return null;
    const vs = spec.find((s) => s.name === params.filterVar);
    const resolved = resolveScaledValues(col, vs);
    return { values: resolved.values as Float64Array, missing: resolved.missingBuffer };
  } else if (params.filter === "pca1" || params.filter === "pca2") {
    const pcIndex = params.filter === "pca1" ? 0 : 1;
    const result = computePCAScores(dataCols, df.nrow, Math.max(2, pcIndex + 1));
    if (!result) return null;
    return { values: result.scores(pcIndex), missing: result.missing };
  } else if (params.filter === "residual") {
    const result = computePCAScores(dataCols, df.nrow, 2);
    if (!result) return null;
    return { values: result.residualDistances(), missing: result.missing };
  } else if (params.filter === "eccentricity") {
    return { values: computeEccentricity(dataCols, df.nrow), missing: new Uint8Array(Math.ceil(df.nrow / 8)) };
  } else if (params.filter === "density") {
    return { values: computeDensity(dataCols, df.nrow), missing: new Uint8Array(Math.ceil(df.nrow / 8)) };
  } else {
    const firstVar = dataCols[0]!.name;
    const col = df.column(firstVar);
    if (!col || (col.type !== "numeric" && col.type !== "integer")) return null;
    const vs = spec.find((s) => s.name === firstVar);
    const resolved = resolveScaledValues(col, vs);
    return { values: resolved.values as Float64Array, missing: resolved.missingBuffer };
  }
}

export const createMapperSlice: StateCreator<AppStore, [], [], MapperSlice> = (set, get) => ({
  mapper: {
    params: { ...DEFAULT_MAPPER_PARAMS },
    graph: null,
    running: false,
    error: null,
    colorBy: "_count",
    selectedNodeId: null,
    sweepResults: null,
    sweepRunning: false,
  },
  setMapperFilter: (filter: FilterFunction) => {
    set((s) => ({ mapper: { ...s.mapper, params: { ...s.mapper.params, filter } } }));
  },
  setMapperFilterVar: (name: string | null) => {
    set((s) => ({ mapper: { ...s.mapper, params: { ...s.mapper.params, filterVar: name } } }));
  },
  setMapperIntervals: (n: number) => {
    set((s) => ({ mapper: { ...s.mapper, params: { ...s.mapper.params, intervals: n } } }));
  },
  setMapperOverlap: (o: number) => {
    set((s) => ({ mapper: { ...s.mapper, params: { ...s.mapper.params, overlap: o } } }));
  },
  setMapperClusterK: (k: number) => {
    set((s) => ({ mapper: { ...s.mapper, params: { ...s.mapper.params, clusterK: k } } }));
  },
  setMapperClusterMethod: (method: MapperClusterMethod) => {
    set((s) => ({ mapper: { ...s.mapper, params: { ...s.mapper.params, clusterMethod: method } } }));
  },
  setMapperClusterLinkage: (linkage: MapperClusterLinkage) => {
    set((s) => ({ mapper: { ...s.mapper, params: { ...s.mapper.params, clusterLinkage: linkage } } }));
  },
  setMapperClusterEps: (eps: number) => {
    set((s) => ({ mapper: { ...s.mapper, params: { ...s.mapper.params, clusterEps: eps } } }));
  },
  setMapperClusterMinPts: (minPts: number) => {
    set((s) => ({ mapper: { ...s.mapper, params: { ...s.mapper.params, clusterMinPts: minPts } } }));
  },
  setMapperVariables: (vars: string[]) => {
    set((s) => ({ mapper: { ...s.mapper, params: { ...s.mapper.params, variables: vars } } }));
  },
  runMapper: () => {
    const { df, spec, mapper } = get();
    if (!df) return;

    set((s) => ({ mapper: { ...s.mapper, running: true, error: null } }));

    try {
      const params = mapper.params;
      const dataCols = (params.variables ?? []).map((v) => {
        const c = df.column(v);
        if (!c || (c.type !== "numeric" && c.type !== "integer")) return null;
        const vs = spec.find((s) => s.name === v);
        const resolved = resolveScaledValues(c, vs);
        return { values: resolved.values, missing: resolved.missingBuffer, name: v };
      }).filter((c): c is NonNullable<typeof c> => c !== null);

      if (dataCols.length === 0) {
        set((s) => ({ mapper: { ...s.mapper, running: false, error: "No valid numeric variables" } }));
        return;
      }

      const filterResult = resolveFilter(df, spec, dataCols, params);
      if (!filterResult) {
        set((s) => ({ mapper: { ...s.mapper, running: false, error: "Filter computation failed" } }));
        return;
      }

      loadMapperWorker().then((WorkerClass) => {
        if (WorkerClass) {
          const worker = new WorkerClass() as Worker;
          worker.onmessage = (e: MessageEvent<{ kind: "graph"; graph: MapperGraph } | { kind: "error"; error: string }>) => {
            worker.terminate();
            const msg = e.data;
            if (msg.kind === "graph") {
              set((s) => ({ mapper: { ...s.mapper, running: false, graph: msg.graph, selectedNodeId: null } }));
            } else {
              set((s) => ({ mapper: { ...s.mapper, running: false, error: msg.error } }));
            }
          };
          worker.onerror = (err) => {
            worker.terminate();
            set((s) => ({ mapper: { ...s.mapper, running: false, error: err.message } }));
          };
          worker.postMessage({
            kind: "compute",
            values: filterResult.values,
            missing: filterResult.missing,
            nRows: df.nrow,
            dataCols,
            params,
          });
        } else {
          setTimeout(() => {
            try {
              const graph = computeMapper(filterResult.values, filterResult.missing, df.nrow, dataCols, params);
              set((s) => ({ mapper: { ...s.mapper, running: false, graph, selectedNodeId: null } }));
            } catch (err) {
              set((s) => ({ mapper: { ...s.mapper, running: false, error: err instanceof Error ? err.message : String(err) } }));
            }
          }, 0);
        }
      });
    } catch (err) {
      set((s) => ({ mapper: { ...s.mapper, running: false, error: err instanceof Error ? err.message : String(err) } }));
    }
  },
  selectMapperNode: (nodeId: number | null) => {
    const currentGraph = get().mapper.graph;
    set((s) => ({ mapper: { ...s.mapper, selectedNodeId: nodeId } }));
    if (nodeId != null && currentGraph) {
      const node = currentGraph.nodes[nodeId];
      if (node) {
        const mask = new Uint8Array(Math.ceil((get().df?.nrow ?? 0) / 8));
        for (const row of node.rows) {
          const byte = row >> 3;
          const bit = row & 7;
          mask[byte]! |= 1 << bit;
        }
        get().setSelectionMask(mask);
      }
    }
  },
  setMapperColorBy: (colorBy: string) => {
    set((s) => ({ mapper: { ...s.mapper, colorBy } }));
  },
  clearMapper: () => {
    set((s) => ({ mapper: { ...s.mapper, graph: null, selectedNodeId: null, error: null, sweepResults: null } }));
  },
  runMapperSweep: () => {
    const { df, spec, mapper } = get();
    if (!df) return;

    set((s) => ({ mapper: { ...s.mapper, sweepRunning: true } }));

    try {
      const params = mapper.params;
      const dataCols = (params.variables ?? []).map((v) => {
        const c = df.column(v);
        if (!c || (c.type !== "numeric" && c.type !== "integer")) return null;
        const vs = spec.find((s) => s.name === v);
        const resolved = resolveScaledValues(c, vs);
        return { values: resolved.values, missing: resolved.missingBuffer, name: v };
      }).filter((c): c is NonNullable<typeof c> => c !== null);

      if (dataCols.length === 0) {
        set((s) => ({ mapper: { ...s.mapper, sweepRunning: false, sweepResults: null } }));
        return;
      }

      const filterResult = resolveFilter(df, spec, dataCols, params);
      if (!filterResult) {
        set((s) => ({ mapper: { ...s.mapper, sweepRunning: false } }));
        return;
      }

      loadMapperWorker().then((WorkerClass) => {
        if (WorkerClass) {
          const worker = new WorkerClass() as Worker;
          worker.onmessage = (e: MessageEvent<{ kind: "sweep"; results: SweepResult[] } | { kind: "error"; error: string }>) => {
            worker.terminate();
            const msg = e.data;
            if (msg.kind === "sweep") {
              set((s) => ({ mapper: { ...s.mapper, sweepRunning: false, sweepResults: msg.results } }));
            } else {
              set((s) => ({ mapper: { ...s.mapper, sweepRunning: false } }));
            }
          };
          worker.onerror = () => {
            worker.terminate();
            set((s) => ({ mapper: { ...s.mapper, sweepRunning: false } }));
          };
          worker.postMessage({
            kind: "sweep",
            values: filterResult.values,
            missing: filterResult.missing,
            nRows: df.nrow,
            dataCols,
            params,
            intervalRange: [5, 8, 10, 15, 20],
            overlapRange: [0.1, 0.3, 0.5, 0.7, 0.9],
          });
        } else {
          setTimeout(() => {
            try {
              const sweepResults = mapperSweep(filterResult.values, filterResult.missing, df.nrow, dataCols, params);
              set((s) => ({ mapper: { ...s.mapper, sweepRunning: false, sweepResults } }));
            } catch {
              set((s) => ({ mapper: { ...s.mapper, sweepRunning: false } }));
            }
          }, 0);
        }
      });
    } catch {
      set((s) => ({ mapper: { ...s.mapper, sweepRunning: false } }));
    }
  },
  clearMapperSweep: () => {
    set((s) => ({ mapper: { ...s.mapper, sweepResults: null } }));
  },
});

function computeEccentricity(
  cols: Array<{ values: Float64Array | Int32Array; missing: Uint8Array; name: string }>,
  nRows: number,
): Float64Array {
  const result = new Float64Array(nRows);
  const p = cols.length;
  for (let i = 0; i < nRows; i++) {
    let maxDist = 0;
    for (let j = 0; j < nRows; j++) {
      let d = 0;
      for (let k = 0; k < p; k++) {
        if (bitGet(cols[k]!.missing, i)) continue;
        if (bitGet(cols[k]!.missing, j)) continue;
        const diff = cols[k]!.values[i]! - cols[k]!.values[j]!;
        d += diff * diff;
      }
      if (d > maxDist) maxDist = d;
    }
    result[i] = Math.sqrt(maxDist);
  }
  return result;
}

function computeDensity(
  cols: Array<{ values: Float64Array | Int32Array; missing: Uint8Array; name: string }>,
  nRows: number,
): Float64Array {
  const result = new Float64Array(nRows);
  const p = cols.length;
  const bandwidth = 1.0;
  const maxRows = Math.min(nRows, 2000);
  const step = nRows > maxRows ? Math.floor(nRows / maxRows) : 1;
  const refIndices: number[] = [];
  for (let i = 0; i < nRows; i += step) refIndices.push(i);

  for (let i = 0; i < nRows; i++) {
    let density = 0;
    for (const j of refIndices) {
      let d2 = 0;
      for (let k = 0; k < p; k++) {
        const diff = cols[k]!.values[i]! - cols[k]!.values[j]!;
        d2 += diff * diff;
      }
      density += Math.exp(-d2 / (2 * bandwidth * bandwidth));
    }
    result[i] = density / refIndices.length;
  }
  return result;
}

function computePCAScores(
  cols: Array<{ values: Float64Array | Int32Array; missing: Uint8Array; name: string }>,
  nRows: number,
  nComponents: number,
): { scores: (pc: number) => Float64Array; residualDistances: () => Float64Array; missing: Uint8Array } | null {
  const p = cols.length;
  if (p < 2 || nRows < 3) return null;

  const missingBuf = new Uint8Array(Math.ceil(nRows / 8));
  const validRows: number[] = [];
  for (let i = 0; i < nRows; i++) {
    let hasMissing = false;
    for (let j = 0; j < p; j++) {
      if (bitGet(cols[j]!.missing, i)) { hasMissing = true; break; }
    }
    if (hasMissing) {
      missingBuf[i >> 3]! |= 1 << (i & 7);
    } else {
      validRows.push(i);
    }
  }

  const n = validRows.length;
  if (n < 3) return null;
  const k = Math.min(nComponents, p, n - 1);

  const means = new Float64Array(p);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      means[j]! += cols[j]!.values[validRows[i]!]!;
    }
  }
  for (let j = 0; j < p; j++) means[j]! /= n;

  const cov = new Float64Array(p * p);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < p; a++) {
      const da = cols[a]!.values[validRows[i]!]! - means[a]!;
      for (let b = a; b < p; b++) {
        cov[a * p + b]! += da * (cols[b]!.values[validRows[i]!]! - means[b]!);
      }
    }
  }
  for (let a = 0; a < p; a++) {
    for (let b = a; b < p; b++) {
      cov[a * p + b]! /= n - 1;
      cov[b * p + a] = cov[a * p + b]!;
    }
  }

  const { values: eigenvalues, vectors } = jacobiEigen(cov, p);

  const pcScores = new Float64Array(nRows * k);
  for (let i = 0; i < nRows; i++) {
    if (bitGet(missingBuf, i)) continue;
    for (let c = 0; c < k; c++) {
      let val = 0;
      for (let j = 0; j < p; j++) {
        val += (cols[j]!.values[i]! - means[j]!) * vectors[j * p + c]!;
      }
      pcScores[i * k + c] = val;
    }
  }

  const reconErrors = new Float64Array(nRows);
  for (let i = 0; i < nRows; i++) {
    if (bitGet(missingBuf, i)) { reconErrors[i] = NaN; continue; }
    let sumSq = 0;
    for (let j = 0; j < p; j++) {
      let recon = means[j]!;
      for (let c = 0; c < k; c++) {
        recon += vectors[j * p + c]! * pcScores[i * k + c]!;
      }
      const diff = cols[j]!.values[i]! - recon;
      sumSq += diff * diff;
    }
    reconErrors[i] = Math.sqrt(sumSq);
  }

  return {
    scores: (pc: number) => {
      const col = new Float64Array(nRows);
      for (let i = 0; i < nRows; i++) {
        col[i] = bitGet(missingBuf, i) ? NaN : pcScores[i * k + pc]!;
      }
      return col;
    },
    residualDistances: () => reconErrors,
    missing: missingBuf,
  };
}

function jacobiEigen(input: Float64Array, n: number): { values: Float64Array; vectors: Float64Array } {
  const EPS = 1e-10;
  const a = new Float64Array(input);
  const v = new Float64Array(n * n);
  for (let i = 0; i < n; i++) v[i * n + i] = 1;

  for (let iter = 0; iter < 100 * n * n; iter++) {
    let pi = 0;
    let qi = 1;
    let maxOff = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const val = Math.abs(a[i * n + j]!);
        if (val > maxOff) { maxOff = val; pi = i; qi = j; }
      }
    }
    if (maxOff < EPS) break;

    const app = a[pi * n + pi]!;
    const aqq = a[qi * n + qi]!;
    const apq = a[pi * n + qi]!;
    const tau = (aqq - app) / (2 * apq);
    const t = Math.sign(tau || 1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;

    for (let k = 0; k < n; k++) {
      if (k === pi || k === qi) continue;
      const akp = a[k * n + pi]!;
      const akq = a[k * n + qi]!;
      a[k * n + pi] = c * akp - s * akq;
      a[pi * n + k] = a[k * n + pi]!;
      a[k * n + qi] = s * akp + c * akq;
      a[qi * n + k] = a[k * n + qi]!;
    }
    a[pi * n + pi] = c * c * app - 2 * s * c * apq + s * s * aqq;
    a[qi * n + qi] = s * s * app + 2 * s * c * apq + c * c * aqq;
    a[pi * n + qi] = 0;
    a[qi * n + pi] = 0;

    for (let k = 0; k < n; k++) {
      const vkp = v[k * n + pi]!;
      const vkq = v[k * n + qi]!;
      v[k * n + pi] = c * vkp - s * vkq;
      v[k * n + qi] = s * vkp + c * vkq;
    }
  }

  const order = Array.from({ length: n }, (_, i) => i)
    .sort((aIdx, bIdx) => Math.abs(a[bIdx * n + bIdx]!) - Math.abs(a[aIdx * n + aIdx]!));
  const values = new Float64Array(n);
  const vectors = new Float64Array(n * n);
  for (let k = 0; k < n; k++) {
    const src = order[k]!;
    values[k] = Math.max(0, a[src * n + src]!);
    for (let row = 0; row < n; row++) vectors[row * n + k] = v[row * n + src]!;
  }
  return { values, vectors };
}
