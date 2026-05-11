import type { Column, ColumnType } from "@/lib/data/types";
import {
  makeCategoricalColumn,
  makeIntegerColumn,
  makeNumericColumn,
} from "@/lib/data/columns";
import { BitMissingMask } from "@/lib/data/missing";

export const MISSING_SENTINELS: ReadonlySet<string> = new Set([
  "", "NA", "na", "N/A", "n/a", "NaN", "nan", "null", "NULL",
]);

export interface InferOptions {
  force?: ColumnType;          // "date" not supported in M1 inference; user overrides instead
}

const INT_RE = /^-?\d+$/;
const NUM_RE = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;

export function inferColumn(
  name: string,
  raw: ReadonlyArray<string>,
  opts: InferOptions = {},
): Column {
  const n = raw.length;
  const missing = new BitMissingMask(n);
  for (let i = 0; i < n; i++) if (MISSING_SENTINELS.has(raw[i]!)) missing.setMissing(i, true);

  const force = opts.force;
  if (force === "date") {
    // Caller should have parsed dates already; M1 doesn't infer dates from strings.
    throw new Error("inferColumn: force 'date' not supported; parse dates explicitly");
  }

  // Decide type if not forced. After the date check above, force can only be numeric/integer/categorical or undefined.
  let chosen: Exclude<ColumnType, "date">;
  if (force) {
    chosen = force;
  } else {
    let allInt = true, allNum = true, anyVal = false;
    for (let i = 0; i < n; i++) {
      if (missing.isMissing(i)) continue;
      anyVal = true;
      const s = raw[i]!;
      if (!INT_RE.test(s)) allInt = false;
      if (!NUM_RE.test(s)) { allInt = false; allNum = false; break; }
    }
    if (!anyVal) chosen = "categorical";
    else if (allInt) chosen = "integer";
    else if (allNum) chosen = "numeric";
    else chosen = "categorical";
  }

  switch (chosen) {
    case "integer": {
      const values = new Int32Array(n);
      for (let i = 0; i < n; i++) if (!missing.isMissing(i)) values[i] = parseInt(raw[i]!, 10);
      return makeIntegerColumn(name, values, missing);
    }
    case "numeric": {
      const values = new Float64Array(n);
      for (let i = 0; i < n; i++) if (!missing.isMissing(i)) values[i] = parseFloat(raw[i]!);
      return makeNumericColumn(name, values, missing);
    }
    case "categorical": {
      const levels: string[] = [];
      const idx = new Map<string, number>();
      const codes = new Int32Array(n);
      for (let i = 0; i < n; i++) {
        if (missing.isMissing(i)) continue;
        const s = raw[i]!;
        let code = idx.get(s);
        if (code === undefined) {
          code = levels.length;
          levels.push(s);
          idx.set(s, code);
        }
        codes[i] = code;
      }
      return makeCategoricalColumn(name, codes, levels, missing);
    }
  }
}
