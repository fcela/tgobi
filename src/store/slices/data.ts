import type { StateCreator } from "zustand";
import type { AppStore, DataSlice } from "@/store/types";

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
  setLoading: (loading) => set({ loading }),
  setError: (msg) => set({ error: msg, loading: false }),
  clear: () => {
    set({ df: null, error: null, loading: false });
    get().resetSelectionFor(0);
    get().resetIdentifyFor(0);
    get().clearEdges();
    get().clearPanels();
  },
});
