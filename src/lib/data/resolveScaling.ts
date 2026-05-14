import type { Column, MissingMask } from "@/lib/data/types";
import type { ScalingMode, VarSpec } from "@/types";
import { scaleColumn } from "@/lib/data/scaling";

export interface ResolvedValues {
  values: Float64Array | Int32Array;
  missingBuffer: Uint8Array;
}

export function resolveScaledValues(
  col: Column,
  varSpec: VarSpec | undefined,
): ResolvedValues {
  const values = col.type === "categorical" ? col.codes : col.values;
  if (!varSpec?.scaling) return { values, missingBuffer: col.missing.buffer };
  if (col.type !== "numeric" && col.type !== "integer") {
    return { values, missingBuffer: col.missing.buffer };
  }
  const scaled = scaleColumn(col.values, col.missing, varSpec.scaling as ScalingMode);
  return { values: scaled.values, missingBuffer: scaled.missing };
}

export function scalingLabel(mode: ScalingMode | undefined): string {
  switch (mode) {
    case "range": return "0–1";
    case "standardize": return "z-score";
    case "robust": return "robust";
    default: return "raw";
  }
}
