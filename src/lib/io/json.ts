import type { Column, ColumnType, DataFrame } from "@/lib/data/types";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { inferColumn } from "@/lib/data/inference";

export type RecordJson = ReadonlyArray<Record<string, unknown>>;
export type ColumnarJson = Record<string, ReadonlyArray<unknown>>;

export interface JsonOptions {
  overrides?: Record<string, ColumnType>;
}

export function parseJson(input: RecordJson | ColumnarJson, opts: JsonOptions = {}): DataFrame {
  if (Array.isArray(input)) return parseRecords(input as RecordJson, opts);
  return parseColumnar(input as ColumnarJson, opts);
}

function parseRecords(rows: RecordJson, opts: JsonOptions): DataFrame {
  if (rows.length === 0) throw new Error("JSON record array is empty");
  const names: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const k of Object.keys(row)) if (!seen.has(k)) { seen.add(k); names.push(k); }
  }
  const columns: Column[] = [];
  for (const name of names) {
    const raw = rows.map((r) => stringify(r[name]));
    const force = opts.overrides?.[name];
    columns.push(inferColumn(name, raw, force ? { force } : {}));
  }
  return new ArrayDataFrame(columns);
}

function parseColumnar(obj: ColumnarJson, opts: JsonOptions): DataFrame {
  const names = Object.keys(obj);
  if (names.length === 0) throw new Error("JSON columnar object is empty");
  const n = obj[names[0]!]!.length;
  for (const name of names) {
    if (obj[name]!.length !== n) {
      throw new Error(`column ${name}: length ${obj[name]!.length} != ${n}`);
    }
  }
  const columns: Column[] = [];
  for (const name of names) {
    const raw = obj[name]!.map(stringify);
    const force = opts.overrides?.[name];
    columns.push(inferColumn(name, raw, force ? { force } : {}));
  }
  return new ArrayDataFrame(columns);
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}
