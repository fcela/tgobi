import { makeNumericColumn } from "@/lib/data/columns";
import { ArrayDataFrame } from "@/lib/data/dataframe";
import { BitMissingMask } from "@/lib/data/missing";
import type { Column, DataFrame, NumericColumn } from "@/lib/data/types";

const EPS = 1e-10;

export interface SphereResult {
  df: DataFrame;
  columns: NumericColumn[];
  names: string[];
}

export function deriveSphereColumns(
  df: DataFrame,
  sources: ReadonlyArray<string>,
  prefix: string,
): SphereResult {
  const uniqueSources = Array.from(new Set(sources));
  if (uniqueSources.length < 2) {
    throw new Error("deriveSphereColumns: need at least two source variables");
  }
  const cols = uniqueSources.map((name) => numericColumn(df, name));
  const validRows = validCompleteRows(df.nrow, cols);
  if (validRows.length < 2) {
    throw new Error("deriveSphereColumns: need at least two complete rows");
  }

  const p = cols.length;
  const means = columnMeans(cols, validRows);
  const cov = covariance(cols, validRows, means);
  const { values: eigenvalues, vectors } = jacobiEigen(cov, p);
  const names = uniqueNames(df.columns.map((c) => c.name), uniqueSources, prefix.trim() || "sphere");
  const outValues = Array.from({ length: p }, () => new Float64Array(df.nrow));
  const missing = Array.from({ length: p }, () => new BitMissingMask(df.nrow));

  for (let row = 0; row < df.nrow; row++) {
    const complete = cols.every((col) => !col.missing.isMissing(row));
    if (!complete) {
      for (let k = 0; k < p; k++) missing[k]!.setMissing(row, true);
      continue;
    }
    for (let k = 0; k < p; k++) {
      const scale = eigenvalues[k]! > EPS ? 1 / Math.sqrt(eigenvalues[k]!) : 0;
      let value = 0;
      for (let j = 0; j < p; j++) {
        value += (cols[j]!.values[row]! - means[j]!) * vectors[j * p + k]!;
      }
      outValues[k]![row] = value * scale;
    }
  }

  const sphereColumns = names.map((name, i) => makeNumericColumn(name, outValues[i]!, missing[i]!));
  return {
    df: new ArrayDataFrame([...df.columns, ...sphereColumns]),
    columns: sphereColumns,
    names,
  };
}

function numericColumn(df: DataFrame, name: string): Extract<Column, { type: "numeric" | "integer" }> {
  const col = df.column(name);
  if (!col) throw new Error(`deriveSphereColumns: unknown source variable "${name}"`);
  if (col.type !== "numeric" && col.type !== "integer") {
    throw new Error(`deriveSphereColumns: source variable "${name}" is not numeric`);
  }
  return col;
}

function validCompleteRows(
  nrow: number,
  cols: ReadonlyArray<Extract<Column, { type: "numeric" | "integer" }>>,
): number[] {
  const rows: number[] = [];
  for (let row = 0; row < nrow; row++) {
    if (cols.every((col) => !col.missing.isMissing(row))) rows.push(row);
  }
  return rows;
}

function columnMeans(
  cols: ReadonlyArray<Extract<Column, { type: "numeric" | "integer" }>>,
  rows: ReadonlyArray<number>,
): Float64Array {
  const means = new Float64Array(cols.length);
  for (let j = 0; j < cols.length; j++) {
    let sum = 0;
    for (const row of rows) sum += cols[j]!.values[row]!;
    means[j] = sum / rows.length;
  }
  return means;
}

function covariance(
  cols: ReadonlyArray<Extract<Column, { type: "numeric" | "integer" }>>,
  rows: ReadonlyArray<number>,
  means: Float64Array,
): Float64Array {
  const p = cols.length;
  const cov = new Float64Array(p * p);
  for (const row of rows) {
    for (let a = 0; a < p; a++) {
      const da = cols[a]!.values[row]! - means[a]!;
      for (let b = a; b < p; b++) {
        const idx = a * p + b;
        cov[idx] = cov[idx]! + da * (cols[b]!.values[row]! - means[b]!);
      }
    }
  }
  const denom = rows.length - 1;
  for (let a = 0; a < p; a++) {
    for (let b = a; b < p; b++) {
      const idx = a * p + b;
      cov[idx] = cov[idx]! / denom;
      cov[b * p + a] = cov[idx]!;
    }
  }
  return cov;
}

function jacobiEigen(input: Float64Array, n: number): { values: Float64Array; vectors: Float64Array } {
  const a = new Float64Array(input);
  const v = new Float64Array(n * n);
  for (let i = 0; i < n; i++) v[i * n + i] = 1;

  for (let iter = 0; iter < 100 * n * n; iter++) {
    let p = 0;
    let q = 1;
    let max = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const value = Math.abs(a[i * n + j]!);
        if (value > max) {
          max = value;
          p = i;
          q = j;
        }
      }
    }
    if (max < EPS) break;

    const app = a[p * n + p]!;
    const aqq = a[q * n + q]!;
    const apq = a[p * n + q]!;
    const tau = (aqq - app) / (2 * apq);
    const t = Math.sign(tau || 1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;

    for (let k = 0; k < n; k++) {
      if (k === p || k === q) continue;
      const akp = a[k * n + p]!;
      const akq = a[k * n + q]!;
      a[k * n + p] = c * akp - s * akq;
      a[p * n + k] = a[k * n + p]!;
      a[k * n + q] = s * akp + c * akq;
      a[q * n + k] = a[k * n + q]!;
    }
    a[p * n + p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    a[q * n + q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    a[p * n + q] = 0;
    a[q * n + p] = 0;

    for (let k = 0; k < n; k++) {
      const vkp = v[k * n + p]!;
      const vkq = v[k * n + q]!;
      v[k * n + p] = c * vkp - s * vkq;
      v[k * n + q] = s * vkp + c * vkq;
    }
  }

  const order = Array.from({ length: n }, (_, i) => i)
    .sort((aIdx, bIdx) => Math.abs(a[bIdx * n + bIdx]!) - Math.abs(a[aIdx * n + aIdx]!));
  const values = new Float64Array(n);
  const vectors = new Float64Array(n * n);
  for (let k = 0; k < n; k++) {
    const src = order[k]!;
    values[k] = Math.max(0, a[src * n + src]!);
    for (let row = 0; row < n; row++) vectors[row * n + k] = v[row * n + src]!;
  }
  return { values, vectors };
}

function uniqueNames(existing: ReadonlyArray<string>, sources: ReadonlyArray<string>, prefix: string): string[] {
  const used = new Set(existing);
  return sources.map((source) => {
    const stem = `${prefix}_${source}`;
    if (!used.has(stem)) {
      used.add(stem);
      return stem;
    }
    for (let i = 2; ; i++) {
      const name = `${stem}_${i}`;
      if (!used.has(name)) {
        used.add(name);
        return name;
      }
    }
  });
}
