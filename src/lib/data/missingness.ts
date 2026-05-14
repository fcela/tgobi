import type { Column, DataFrame } from "@/lib/data/types";
import { BitMissingMask } from "@/lib/data/missing";
import { makeNumericColumn } from "@/lib/data/columns";

export interface MissingnessPattern {
  key: string;
  mask: boolean[];
  count: number;
  rows: number[];
}

export interface VariableMissingSummary {
  name: string;
  missing: number;
  total: number;
  percent: number;
}

export interface RowMissingSummary {
  index: number;
  missing: number;
  total: number;
  percent: number;
}

export function missingnessMatrix(
  df: DataFrame,
  varNames?: string[],
): { rows: number; cols: number; matrix: Uint8Array; varNames: string[] } {
  const cols = varNames
    ? varNames.map((n) => df.column(n)).filter((c): c is Column => c != null)
    : [...df.columns];
  const names = cols.map((c) => c.name);
  const nrow = df.nrow;
  const ncol = cols.length;
  const matrix = new Uint8Array(nrow * ncol);
  for (let j = 0; j < ncol; j++) {
    const mask = cols[j]!.missing;
    for (let i = 0; i < nrow; i++) {
      if (mask.isMissing(i)) matrix[i * ncol + j] = 1;
    }
  }
  return { rows: nrow, cols: ncol, matrix, varNames: names };
}

export function missingnessPatterns(
  df: DataFrame,
  varNames?: string[],
): MissingnessPattern[] {
  const { cols, matrix, varNames: names } = missingnessMatrix(df, varNames);
  const ncol = cols;
  const nrow = df.nrow;
  const patternMap = new Map<string, { mask: boolean[]; rows: number[] }>();

  for (let i = 0; i < nrow; i++) {
    const mask: boolean[] = new Array(ncol);
    const parts: string[] = new Array(ncol);
    for (let j = 0; j < ncol; j++) {
      const v = matrix[i * ncol + j]! === 1;
      mask[j] = v;
      parts[j] = v ? "1" : "0";
    }
    const key = parts.join("");
    let entry = patternMap.get(key);
    if (!entry) {
      entry = { mask, rows: [] };
      patternMap.set(key, entry);
    }
    entry.rows.push(i);
  }

  const patterns: MissingnessPattern[] = [];
  for (const [key, { mask, rows }] of patternMap) {
    patterns.push({ key, mask, count: rows.length, rows });
  }
  patterns.sort((a, b) => b.count - a.count);
  return patterns;
}

export function variableMissingSummaries(
  df: DataFrame,
  varNames?: string[],
): VariableMissingSummary[] {
  const cols = varNames
    ? varNames.map((n) => df.column(n)).filter((c): c is Column => c != null)
    : [...df.columns];
  return cols.map((c) => {
    const missing = c.missing.count();
    return {
      name: c.name,
      missing,
      total: c.length,
      percent: c.length > 0 ? (missing / c.length) * 100 : 0,
    };
  });
}

export function rowMissingCounts(
  df: DataFrame,
  varNames?: string[],
): RowMissingSummary[] {
  const { cols, matrix } = missingnessMatrix(df, varNames);
  const ncol = cols;
  const nrow = df.nrow;
  const out: RowMissingSummary[] = new Array(nrow);
  for (let i = 0; i < nrow; i++) {
    let count = 0;
    for (let j = 0; j < ncol; j++) {
      if (matrix[i * ncol + j]! === 1) count++;
    }
    out[i] = {
      index: i,
      missing: count,
      total: ncol,
      percent: ncol > 0 ? (count / ncol) * 100 : 0,
    };
  }
  return out;
}

export function createMissingIndicatorColumns(
  df: DataFrame,
  varNames?: string[],
): Array<{ name: string; values: Float64Array; missing: BitMissingMask }> {
  const cols = varNames
    ? varNames.map((n) => df.column(n)).filter((c): c is Column => c != null)
    : [...df.columns];
  const nrow = df.nrow;
  return cols.map((c) => {
    const values = new Float64Array(nrow);
    const mask = new BitMissingMask(nrow);
    for (let i = 0; i < nrow; i++) {
      if (c.missing.isMissing(i)) {
        values[i] = 1;
      } else {
        values[i] = 0;
      }
    }
    return { name: `miss_${c.name}`, values, missing: mask };
  });
}

export function imputeFixedValue(
  col: Column,
  value: number,
): Float64Array {
  const n = col.length;
  const out = new Float64Array(n);
  const src = col.type === "categorical" ? col.codes : col.values;
  for (let i = 0; i < n; i++) {
    if (col.missing.isMissing(i)) {
      out[i] = value;
    } else {
      out[i] = src[i]!;
    }
  }
  return out;
}

export function imputeRandomObserved(
  col: Column,
  seed: number = 0,
): Float64Array {
  const n = col.length;
  const out = new Float64Array(n);
  const src = col.type === "categorical" ? col.codes : col.values;
  const observed: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!col.missing.isMissing(i)) {
      observed.push(src[i]!);
    }
  }
  if (observed.length === 0) {
    for (let i = 0; i < n; i++) out[i] = 0;
    return out;
  }
  let state = seed | 0;
  for (let i = 0; i < n; i++) {
    if (col.missing.isMissing(i)) {
      state = xorshift32(state);
      const idx = ((state >>> 0) / 0x100000000) * observed.length;
      out[i] = observed[Math.floor(idx)]!;
    } else {
      out[i] = src[i]!;
    }
  }
  return out;
}

export function imputeConditionalRandom(
  df: DataFrame,
  col: Column,
  condVar: string,
  seed: number = 0,
): Float64Array {
  const condCol = df.column(condVar);
  if (!condCol || condCol.type !== "categorical") {
    return imputeRandomObserved(col, seed);
  }
  const n = col.length;
  const out = new Float64Array(n);
  const src = col.type === "categorical" ? col.codes : col.values;
  const byLevel = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    if (col.missing.isMissing(i) || condCol.missing.isMissing(i)) continue;
    const level = condCol.codes[i]!;
    let bucket = byLevel.get(level);
    if (!bucket) { bucket = []; byLevel.set(level, bucket); }
    bucket.push(src[i]!);
  }
  let state = seed | 0;
  for (let i = 0; i < n; i++) {
    if (!col.missing.isMissing(i)) {
      out[i] = src[i]!;
      continue;
    }
    if (condCol.missing.isMissing(i)) {
      state = xorshift32(state);
      const allObserved: number[] = [];
      for (const vals of byLevel.values()) allObserved.push(...vals);
      if (allObserved.length === 0) { out[i] = 0; continue; }
      const idx = ((state >>> 0) / 0x100000000) * allObserved.length;
      out[i] = allObserved[Math.floor(idx)]!;
      continue;
    }
    const level = condCol.codes[i]!;
    const bucket = byLevel.get(level);
    if (!bucket || bucket.length === 0) {
      const allObserved: number[] = [];
      for (const vals of byLevel.values()) allObserved.push(...vals);
      if (allObserved.length === 0) { out[i] = 0; continue; }
      state = xorshift32(state);
      const idx = ((state >>> 0) / 0x100000000) * allObserved.length;
      out[i] = allObserved[Math.floor(idx)]!;
      continue;
    }
    state = xorshift32(state);
    const idx = ((state >>> 0) / 0x100000000) * bucket.length;
    out[i] = bucket[Math.floor(idx)]!;
  }
  return out;
}

function xorshift32(state: number): number {
  let x = state | 0;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  return x;
}
