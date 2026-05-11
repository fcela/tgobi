import type { DataFrame } from "@/lib/data/types";

export function formatCellValue(df: DataFrame, row: number, name: string): string {
  const col = df.column(name);
  if (!col || row < 0 || row >= df.nrow) return "";
  if (col.missing.isMissing(row)) return "NA";

  if (col.type === "categorical") {
    return col.levels[col.codes[row]!] ?? String(col.codes[row]!);
  }
  if (col.type === "date") {
    const d = new Date(col.values[row]!);
    return Number.isNaN(d.getTime()) ? "NA" : d.toISOString().slice(0, 10);
  }
  return formatNumber(col.values[row]!);
}

export function formatRowLabel(df: DataFrame, row: number, labelVar: string | null): string {
  if (labelVar && df.column(labelVar)) {
    const value = formatCellValue(df, row, labelVar);
    if (value) return value;
  }
  return `row ${row + 1}`;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "NA";
  if (Number.isInteger(value)) return String(value);
  const abs = Math.abs(value);
  if (abs > 0 && (abs < 0.001 || abs >= 10000)) return value.toPrecision(4);
  return value.toFixed(4).replace(/\.?0+$/, "");
}
