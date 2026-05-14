import type { StateCreator } from "zustand";
import type { AppStore, MissingSlice } from "@/store/types";
import type { DeriveSpec } from "@/lib/data/types";
import { ArrayDataFrame } from "@/lib/data/dataframe";

type ImputationDerive = Extract<DeriveSpec, { kind: "imputeFixed" | "imputeRandom" | "imputeConditional" }>;

function isImputationDerive(d: unknown): d is ImputationDerive {
  if (typeof d !== "object" || d === null) return false;
  const kind = (d as { kind: string }).kind;
  return kind === "imputeFixed" || kind === "imputeRandom" || kind === "imputeConditional";
}

export const createMissingSlice: StateCreator<AppStore, [], [], MissingSlice> = (set, get) => ({
  missing: {
    imputation: {
      method: "none",
      fixedValue: 0,
      seed: 0,
      condVar: null,
    },
    showMarginals: false,
    imputationSets: 5,
    imputationIndex: 0,
  },
  setImputationMethod: (method) =>
    set((s) => ({ missing: { ...s.missing, imputation: { ...s.missing.imputation, method } } })),
  setImputationFixedValue: (value) =>
    set((s) => ({ missing: { ...s.missing, imputation: { ...s.missing.imputation, fixedValue: value } } })),
  setImputationSeed: (seed) =>
    set((s) => ({ missing: { ...s.missing, imputation: { ...s.missing.imputation, seed } } })),
  setImputationCondVar: (name) =>
    set((s) => ({ missing: { ...s.missing, imputation: { ...s.missing.imputation, condVar: name } } })),
  setShowMarginals: (show) =>
    set((s) => ({ missing: { ...s.missing, showMarginals: show } })),
  setImputationSets: (n) =>
    set((s) => ({ missing: { ...s.missing, imputationSets: n } })),
  setImputationIndex: (i) =>
    set((s) => ({ missing: { ...s.missing, imputationIndex: i } })),
  cycleImputation: () => {
    const { missing, df, spec } = get();
    if (!df) return;
    const baseSeed = missing.imputation.seed - missing.imputationIndex;
    const nextIndex = (missing.imputationIndex + 1) % missing.imputationSets;
    const newSeed = baseSeed + nextIndex;
    const imputationVars = spec.filter((v) => isImputationDerive(v.derived));
    if (imputationVars.length === 0) {
      set((s) => ({
        missing: { ...s.missing, imputationIndex: nextIndex, imputation: { ...s.missing.imputation, seed: newSeed } },
      }));
      return;
    }
    const nonImputationSpecs = spec.filter((v) => !isImputationDerive(v.derived));
    const imputationNames = new Set(imputationVars.map((v) => v.name));
    const baseColumns = df.columns.filter((c) => !imputationNames.has(c.name));
    let rebuilt = new ArrayDataFrame(baseColumns) as import("@/lib/data/types").DataFrame;
    const newSpecs = [...nonImputationSpecs];
    for (const vs of imputationVars) {
      const d = vs.derived as ImputationDerive;
      let newDerive: DeriveSpec;
      if (d.kind === "imputeFixed") {
        newDerive = { ...d };
      } else if (d.kind === "imputeRandom") {
        newDerive = { kind: "imputeRandom", source: d.source, seed: newSeed };
      } else {
        newDerive = { kind: "imputeConditional", source: d.source, condVar: d.condVar, seed: newSeed };
      }
      rebuilt = rebuilt.derive(vs.name, newDerive);
      newSpecs.push({ ...vs, derived: newDerive });
    }
    set({
      df: rebuilt,
      spec: newSpecs,
      missing: { ...get().missing, imputationIndex: nextIndex, imputation: { ...get().missing.imputation, seed: newSeed } },
    });
  },
});
