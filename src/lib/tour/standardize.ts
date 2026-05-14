import type { DataFrame } from "@/lib/data/types";
import type { VarSpec, ScalingMode } from "@/types";
import { makeMat, type Mat } from "@/lib/linalg/types";
import { bitGet } from "@/lib/brush/hitTest";
import { scaleColumn } from "@/lib/data/scaling";

export function toStandardisedMatrix(
  df: DataFrame,
  vars: ReadonlyArray<string>,
  shadow: Uint8Array,
  varSpecs?: ReadonlyArray<VarSpec>,
): Mat {
  const specMap = varSpecs ? new Map(varSpecs.map((v) => [v.name, v])) : null;
  const cols = vars.map((name) => {
    const c = df.column(name);
    if (!c) throw new Error(`toStandardisedMatrix: unknown column ${name}`);
    if (c.type !== "numeric" && c.type !== "integer") {
      throw new Error(`toStandardisedMatrix: column ${name} must be numeric/integer`);
    }
    return c;
  });
  const n = df.nrow, p = vars.length;
  const out = new Float64Array(n * p);

  for (let j = 0; j < p; j++) {
    const c = cols[j]!;
    const varName = vars[j]!;
    const scaling = specMap?.get(varName)?.scaling;

    if (scaling) {
      const scaled = scaleColumn(c.values, c.missing, scaling as ScalingMode);
      for (let i = 0; i < n; i++) {
        if (bitGet(shadow, i) || c.missing.isMissing(i)) {
          out[i * p + j] = 0;
          continue;
        }
        out[i * p + j] = scaled.values[i]!;
      }
    } else {
      let count = 0, sum = 0;
      for (let i = 0; i < n; i++) {
        if (bitGet(shadow, i)) continue;
        if (c.missing.isMissing(i)) continue;
        sum += c.values[i]!;
        count++;
      }
      const mean = count > 0 ? sum / count : 0;
      let ss = 0;
      for (let i = 0; i < n; i++) {
        if (bitGet(shadow, i)) continue;
        if (c.missing.isMissing(i)) continue;
        const d = c.values[i]! - mean;
        ss += d * d;
      }
      const sd = count > 1 ? Math.sqrt(ss / (count - 1)) : 0;
      for (let i = 0; i < n; i++) {
        if (c.missing.isMissing(i)) {
          out[i * p + j] = 0;
          continue;
        }
        out[i * p + j] = sd > 0 ? (c.values[i]! - mean) / sd : 0;
      }
    }
  }

  return makeMat(n, p, out);
}
