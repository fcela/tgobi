import { create } from "zustand";
import type { AppStore } from "@/store/types";
import { createDataSlice } from "@/store/slices/data";
import { createVariablesSlice } from "@/store/slices/variables";
import { createSelectionSlice } from "@/store/slices/selection";
import { createBrushSlice } from "@/store/slices/brush";
import { createColorSlice } from "@/store/slices/color";
import { createToolsSlice } from "@/store/slices/tools";
import { createEdgesSlice } from "@/store/slices/edges";
import { createHullsSlice } from "@/store/slices/hulls";
import { createPlotsSlice } from "@/store/slices/plots";
import { createTourSlice } from "@/store/slices/tour";

export const useAppStore = create<AppStore>()((...a) => ({
  ...createDataSlice(...a),
  ...createVariablesSlice(...a),
  ...createSelectionSlice(...a),
  ...createBrushSlice(...a),
  ...createColorSlice(...a),
  ...createToolsSlice(...a),
  ...createEdgesSlice(...a),
  ...createHullsSlice(...a),
  ...createPlotsSlice(...a),
  ...createTourSlice(...a),
}));
