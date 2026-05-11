import Papa from "papaparse";
import type { Column, ColumnType, DataFrame } from "@/lib/data/types";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { inferColumn } from "@/lib/data/inference";

export interface CsvOptions {
  delimiter?: string;
  overrides?: Record<string, ColumnType>;
}

export function parseCsv(text: string, opts: CsvOptions = {}): DataFrame {
  if (text.trim().length === 0) throw new Error("CSV input is empty");
  const result = Papa.parse<string[]>(text, {
    delimiter: opts.delimiter,
    skipEmptyLines: true,
    header: false,
  });
  if (result.errors.length > 0) {
    const e = result.errors[0]!;
    throw new Error(`CSV parse error at row ${e.row}: ${e.message}`);
  }
  const rows = result.data as string[][];
  if (rows.length < 2) throw new Error("CSV must have a header row and at least one data row");
  const header = rows[0]!;
  const body = rows.slice(1);
  const ncol = header.length;

  const columns: Column[] = [];
  for (let c = 0; c < ncol; c++) {
    const name = header[c]!;
    const raw = new Array<string>(body.length);
    for (let r = 0; r < body.length; r++) raw[r] = body[r]![c] ?? "";
    const force = opts.overrides?.[name];
    columns.push(inferColumn(name, raw, force ? { force } : {}));
  }
  return new ArrayDataFrame(columns);
}
