import Papa from "papaparse";
import type { Column, DataFrame } from "@/lib/data/types";

export interface ExportOptions {
  shadow?: Uint8Array;
  visibleOnly?: boolean;
  paint?: Uint8Array;
  cluster?: Int16Array | null;
}

export function exportCsv(df: DataFrame, opts: ExportOptions = {}): string {
  const headers: string[] = df.columns.map((c) => c.name);
  const extraCols: string[] = [];
  if (opts.paint) extraCols.push("_paint_group");
  if (opts.cluster) extraCols.push("_cluster");
  headers.push(...extraCols);

  const rows: string[][] = [];
  for (let i = 0; i < df.nrow; i++) {
    if (opts.visibleOnly && opts.shadow) {
      const byte = opts.shadow[i >> 3] ?? 0;
      const bit = (byte >> (i & 7)) & 1;
      if (bit) continue;
    }
    const row: string[] = [];
    for (const col of df.columns) {
      row.push(formatCell(col, i));
    }
    if (opts.paint) row.push(String(opts.paint[i] ?? 0));
    if (opts.cluster) row.push(String(opts.cluster[i] ?? -1));
    rows.push(row);
  }

  return Papa.unparse({ fields: headers, data: rows });
}

function formatCell(col: Column, i: number): string {
  if (col.missing.isMissing(i)) return "";
  switch (col.type) {
    case "numeric":
      return String(col.values[i]!);
    case "integer":
      return String(col.values[i]!);
    case "categorical":
      return col.levels[col.codes[i]!] ?? "";
    case "date":
      return new Date(col.values[i]!).toISOString().slice(0, 10);
  }
}

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
