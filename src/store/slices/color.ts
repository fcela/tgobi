import type { StateCreator } from "zustand";
import type { AppStore, ColorEncoding, ColorSlice } from "@/store/types";

export const createColorSlice: StateCreator<AppStore, [], [], ColorSlice> = (set) => ({
  color: {
    encoding: { kind: "fixed" },
    palette: "tableau10",
  },
  setColorEncoding: (encoding: ColorEncoding) =>
    set((s) => ({ color: { ...s.color, encoding } })),
  setColorPalette: (palette: string) => set((s) => ({ color: { ...s.color, palette } })),
});
