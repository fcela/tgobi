import type { StateCreator } from "zustand";
import type { AppStore, SessionSlice } from "@/store/types";
import { downloadSession, loadSessionFromFile, importSession } from "@/lib/session/session";

export const createSessionSlice: StateCreator<AppStore, [], [], SessionSlice> = (set, get) => ({
  saveSession: () => {
    const store = get();
    try {
      downloadSession(store as unknown as AppStore);
    } catch (e) {
      set((s) => ({ projection: { ...s.projection, error: e instanceof Error ? e.message : "Session save failed" } }));
    }
  },

  openSession: async () => {
    try {
      const file = await loadSessionFromFile();
      const { df, state } = importSession(file);
      set({
        df,
        ...state,
        plots: { panels: [], nextId: 0, root: null, nextTileId: 0 },
      });
    } catch (e) {
      set((s) => ({ projection: { ...s.projection, error: e instanceof Error ? e.message : "Session load failed" } }));
    }
  },
});
