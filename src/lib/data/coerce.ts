import {
  makeCategoricalColumn,
  makeDateColumn,
  makeIntegerColumn,
  makeNumericColumn,
} from "@/lib/data/columns";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { BitMissingMask } from "@/lib/data/missing";
import type { Column, ColumnType, DataFrame, MissingMask } from "@/lib/data/types";

export function coerceDataFrame(
  df: DataFrame,
  overrides: Record<string, ColumnType>,
): DataFrame {
  const columns = df.columns.map((column) => {
    const target = overrides[column.name];
    if (!target || target === column.type) return column;
    return coerceColumn(column, target);
  });
  return columns.every((column, i) => column === df.columns[i]) ? df : new ArrayDataFrame(columns);
}

export function coerceColumn(column: Column, target: ColumnType): Column {
  if (column.type === target) return column;
  if (target === "numeric") return coerceToNumeric(column);
  if (target === "integer") return coerceToInteger(column);
  if (target === "categorical") return coerceToCategorical(column);
  if (target === "date") return coerceToDate(column);
  return column;
}

function coerceToNumeric(column: Column): Column {
  const values = new Float64Array(column.length);
  const missing = new BitMissingMask(column.length);
  for (let i = 0; i < column.length; i++) {
    const value = numericValue(column, i);
    if (value == null || !Number.isFinite(value)) missing.setMissing(i, true);
    else values[i] = value;
  }
  return makeNumericColumn(column.name, values, missing);
}

function coerceToInteger(column: Column): Column {
  const values = new Int32Array(column.length);
  const missing = new BitMissingMask(column.length);
  for (let i = 0; i < column.length; i++) {
    const value = numericValue(column, i);
    if (value == null || !Number.isFinite(value) || !Number.isInteger(value)) {
      missing.setMissing(i, true);
    } else {
      values[i] = value;
    }
  }
  return makeIntegerColumn(column.name, values, missing);
}

function coerceToCategorical(column: Column): Column {
  const codes = new Int32Array(column.length);
  const missing = copyMask(column.missing, column.length);
  const levels: string[] = [];
  const byLevel = new Map<string, number>();
  for (let i = 0; i < column.length; i++) {
    if (missing.isMissing(i)) continue;
    const label = cellLabel(column, i);
    let code = byLevel.get(label);
    if (code == null) {
      code = levels.length;
      levels.push(label);
      byLevel.set(label, code);
    }
    codes[i] = code;
  }
  return makeCategoricalColumn(column.name, codes, levels, missing);
}

function coerceToDate(column: Column): Column {
  const values = new Float64Array(column.length);
  const missing = new BitMissingMask(column.length);
  for (let i = 0; i < column.length; i++) {
    const value = dateValue(column, i);
    if (value == null || !Number.isFinite(value)) missing.setMissing(i, true);
    else values[i] = value;
  }
  return makeDateColumn(column.name, values, missing);
}

function numericValue(column: Column, row: number): number | null {
  if (column.missing.isMissing(row)) return null;
  if (column.type === "numeric" || column.type === "integer" || column.type === "date") {
    return column.values[row]!;
  }
  const label = column.levels[column.codes[row]!] ?? "";
  const value = Number(label);
  return Number.isFinite(value) ? value : null;
}

function dateValue(column: Column, row: number): number | null {
  if (column.missing.isMissing(row)) return null;
  if (column.type === "date") return column.values[row]!;
  if (column.type === "numeric" || column.type === "integer") return column.values[row]!;
  const label = column.levels[column.codes[row]!] ?? "";
  const value = Date.parse(label);
  return Number.isNaN(value) ? null : value;
}

function cellLabel(column: Column, row: number): string {
  if (column.type === "categorical") return column.levels[column.codes[row]!] ?? "";
  if (column.type === "date") {
    const date = new Date(column.values[row]!);
    return Number.isNaN(date.getTime()) ? "NA" : date.toISOString().slice(0, 10);
  }
  return String(column.values[row]!);
}

function copyMask(mask: MissingMask, length: number): MissingMask {
  return new BitMissingMask(length, new Uint8Array(mask.buffer));
}
