import type { StateCreator } from "zustand";
import type { AppStore, DataSlice } from "@/store/types";
import { deriveSphereColumns } from "@/lib/data/sphere";

export const createDataSlice: StateCreator<AppStore, [], [], DataSlice> = (set, get) => ({
  df: null,
  loading: false,
  error: null,
  setData: (df) => {
    set({ df, error: null, loading: false });
    get().resetSelectionFor(df.nrow);
    get().resetIdentifyFor(df.nrow);
    get().clearEdges();
    get().clearPanels();
  },
  deriveColumn: (name, spec) => {
    const current = get().df;
    if (!current) throw new Error("deriveColumn: no data loaded");
    const trimmed = name.trim();
    if (!trimmed) throw new Error("deriveColumn: name is required");
    const source = current.column(spec.source);
    if (!source) throw new Error(`deriveColumn: unknown source column "${spec.source}"`);
    const validSource =
      spec.kind === "jitter"
        ? source.type === "numeric" || source.type === "integer" || source.type === "categorical"
        : source.type === "numeric" || source.type === "integer";
    if (!validSource) {
      throw new Error(`deriveColumn: source column "${spec.source}" is not numeric`);
    }
    if (spec.kind === "power" && !Number.isFinite(spec.exponent)) {
      throw new Error("deriveColumn: power exponent must be finite");
    }
    if (spec.kind === "jitter" && (!Number.isFinite(spec.amplitude) || spec.amplitude < 0 || !Number.isFinite(spec.seed))) {
      throw new Error("deriveColumn: jitter requires a non-negative amplitude and finite seed");
    }
    const next = current.derive(trimmed, spec);
    const derived = next.column(trimmed);
    if (!derived) throw new Error(`deriveColumn: failed to create "${trimmed}"`);
    set((s) => ({
      df: next,
      error: null,
      loading: false,
      spec: [...s.spec, { name: trimmed, type: derived.type, included: true, derived: spec }],
    }));
  },
  deriveSphere: (prefix, sources) => {
    const current = get().df;
    if (!current) throw new Error("deriveSphere: no data loaded");
    const sourceList = Array.from(new Set(sources));
    const result = deriveSphereColumns(current, sourceList, prefix);
    const spherePrefix = prefix.trim() || "sphere";
    set((s) => ({
      df: result.df,
      error: null,
      loading: false,
      spec: [
        ...s.spec,
        ...result.columns.map((col, component) => ({
          name: col.name,
          type: col.type,
          included: true,
          derived: { kind: "sphere" as const, sources: sourceList, component, prefix: spherePrefix },
        })),
      ],
    }));
  },
  setLoading: (loading) => set({ loading }),
  setError: (msg) => set({ error: msg, loading: false }),
  clear: () => {
    set({ df: null, error: null, loading: false });
    get().resetSelectionFor(0);
    get().resetIdentifyFor(0);
    get().clearEdges();
    get().clearPanels();
    get().clearClustering();
  },
});
