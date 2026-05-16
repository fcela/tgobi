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
import { createMissingSlice } from "@/store/slices/missing";
import { createClusteringSlice } from "@/store/slices/clustering";
import { createClassificationSlice } from "@/store/slices/classification";
import { createProjectionSlice } from "@/store/slices/projection";
import { createScagnosticsSlice } from "@/store/slices/scagnostics";
import { createMapperSlice } from "@/store/slices/mapper";
import { createLessonSlice } from "@/store/slices/lessons";
import { createSessionSlice } from "@/store/slices/session";

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
  ...createMissingSlice(...a),
  ...createClusteringSlice(...a),
  ...createClassificationSlice(...a),
  ...createProjectionSlice(...a),
  ...createScagnosticsSlice(...a),
  ...createMapperSlice(...a),
  ...createLessonSlice(...a),
  ...createSessionSlice(...a),
}));
