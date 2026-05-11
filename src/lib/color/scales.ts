import type { CategoricalColumn, NumericColumn, IntegerColumn } from "@/lib/data/types";

const NEUTRAL = "#777777";

function clampStop(t: number, n: number): number {
  // map t in [0,1] to integer stop index in [0, n-1]
  if (!isFinite(t)) return 0;
  const i = Math.round(t * (n - 1));
  return Math.max(0, Math.min(n - 1, i));
}

export function categoricalScale(
  col: CategoricalColumn,
  palette: ReadonlyArray<string>,
): (rowIndex: number) => string {
  return (i: number) => {
    if (col.missing.isMissing(i)) return NEUTRAL;
    const code = col.codes[i]!;
    return palette[code % palette.length]!;
  };
}

function numericMinMax(col: NumericColumn | IntegerColumn): { min: number; max: number } {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < col.length; i++) {
    if (col.missing.isMissing(i)) continue;
    const v = col.values[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!isFinite(min) || !isFinite(max)) { min = 0; max = 1; }
  return { min, max };
}

export function sequentialScale(
  col: NumericColumn | IntegerColumn,
  palette: ReadonlyArray<string>,
): (rowIndex: number) => string {
  const { min, max } = numericMinMax(col);
  const range = max - min;
  return (i: number) => {
    if (col.missing.isMissing(i)) return NEUTRAL;
    const v = col.values[i]!;
    const t = range > 0 ? (v - min) / range : 0;
    return palette[clampStop(t, palette.length)]!;
  };
}

export function divergingScale(
  col: NumericColumn | IntegerColumn,
  palette: ReadonlyArray<string>,
): (rowIndex: number) => string {
  const { min, max } = numericMinMax(col);
  const half = Math.max(Math.abs(min), Math.abs(max), 1e-12);
  return (i: number) => {
    if (col.missing.isMissing(i)) return NEUTRAL;
    const v = col.values[i]!;
    const t = (v + half) / (2 * half);   // [0,1]
    return palette[clampStop(t, palette.length)]!;
  };
}
