import type { StateCreator } from "zustand";
import type { AppStore, ScagnosticsSlice } from "@/store/types";
import { computeAllPairs, type ScagnosticMeasure, type ScagnosticResult } from "@/lib/scagnostics";

let ScagWorkerClass: (new () => Worker) | null = null;
let scagWorkerLoaded = false;
async function loadScagWorker(): Promise<(new () => Worker) | null> {
  if (scagWorkerLoaded) return ScagWorkerClass;
  scagWorkerLoaded = true;
  if (typeof Worker === "undefined") return null;
  try {
    const mod = await import("@/workers/scagnostics.worker.ts?worker");
    ScagWorkerClass = mod.default;
    return ScagWorkerClass;
  } catch {
    return null;
  }
}

export const createScagnosticsSlice: StateCreator<AppStore, [], [], ScagnosticsSlice> = (set, get) => ({
  scagnostics: {
    variables: [],
    results: null,
    running: false,
    error: null,
    sortMeasure: "clumpy" as ScagnosticMeasure,
    sortDescending: true,
    filterThreshold: 0,
    filterMeasure: "clumpy" as ScagnosticMeasure,
    scatmatReorderBy: null,
    scatmatReorderDescending: true,
  },

  setScagnosticsVariables: (variables: string[]) =>
    set((s) => ({ scagnostics: { ...s.scagnostics, variables, results: null, error: null } })),

  runScagnostics: () => {
    const { df } = get();
    const { variables } = get().scagnostics;
    if (!df || variables.length < 2) {
      set((s) => ({ scagnostics: { ...s.scagnostics, error: "Need data and 2+ variables" } }));
      return;
    }

    set((s) => ({ scagnostics: { ...s.scagnostics, running: true, error: null } }));

    const columns: Array<{
      name: string;
      type: string;
      values?: Float64Array | Int32Array;
      missing: { buffer: Uint8Array };
    }> = [];
    for (const v of variables) {
      const c = df.column(v);
      if (c && (c.type === "numeric" || c.type === "integer") && c.values) {
        columns.push({ name: c.name, type: c.type, values: c.values, missing: { buffer: c.missing.buffer } });
      }
    }

    loadScagWorker().then((WorkerClass) => {
      if (WorkerClass) {
        const worker = new WorkerClass() as Worker;
        worker.onmessage = (e: MessageEvent<{ kind: "result"; results: ScagnosticResult[] } | { kind: "error"; error: string }>) => {
          worker.terminate();
          const msg = e.data;
          if (msg.kind === "result") {
            set((s) => ({ scagnostics: { ...s.scagnostics, results: msg.results, running: false } }));
          } else {
            set((s) => ({ scagnostics: { ...s.scagnostics, running: false, error: msg.error } }));
          }
        };
        worker.onerror = (err) => {
          worker.terminate();
          set((s) => ({ scagnostics: { ...s.scagnostics, running: false, error: err.message } }));
        };
        worker.postMessage({ columns, nrow: df.nrow, variables });
      } else {
        setTimeout(() => {
          try {
            const results = computeAllPairs(df, variables);
            set((s) => ({ scagnostics: { ...s.scagnostics, results, running: false } }));
          } catch (e) {
            set((s) => ({ scagnostics: { ...s.scagnostics, running: false, error: e instanceof Error ? e.message : String(e) } }));
          }
        }, 0);
      }
    });
  },

  setScagnosticsSortMeasure: (measure: ScagnosticMeasure) =>
    set((s) => ({ scagnostics: { ...s.scagnostics, sortMeasure: measure } })),

  setScagnosticsSortDescending: (desc: boolean) =>
    set((s) => ({ scagnostics: { ...s.scagnostics, sortDescending: desc } })),

  setScagnosticsFilterMeasure: (measure: ScagnosticMeasure) =>
    set((s) => ({ scagnostics: { ...s.scagnostics, filterMeasure: measure } })),

  setScagnosticsFilterThreshold: (threshold: number) =>
    set((s) => ({ scagnostics: { ...s.scagnostics, filterThreshold: threshold } })),

  setScagnosticsScatmatReorderBy: (measure: ScagnosticMeasure | null) =>
    set((s) => ({ scagnostics: { ...s.scagnostics, scatmatReorderBy: measure } })),

  setScagnosticsScatmatReorderDescending: (desc: boolean) =>
    set((s) => ({ scagnostics: { ...s.scagnostics, scatmatReorderDescending: desc } })),

  clearScagnostics: () =>
    set(() => ({
      scagnostics: {
        variables: [],
        results: null,
        running: false,
        error: null,
        sortMeasure: "clumpy" as ScagnosticMeasure,
        sortDescending: true,
        filterThreshold: 0,
        filterMeasure: "clumpy" as ScagnosticMeasure,
        scatmatReorderBy: null,
        scatmatReorderDescending: true,
      },
    })),
});
