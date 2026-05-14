import type { MissingMask } from "@/lib/data/types";
import type { ScalingMode } from "@/types";

export interface ScaledColumn {
  values: Float64Array;
  missing: Uint8Array;
}

export function scaleColumn(
  values: Float64Array | Int32Array,
  missing: MissingMask,
  mode: ScalingMode,
): ScaledColumn {
  const n = values.length;
  const out = new Float64Array(n);
  const outMask = new Uint8Array(Math.ceil(n / 8));

  for (let i = 0; i < n; i++) {
    if (missing.isMissing(i)) {
      outMask[i >> 3] = outMask[i >> 3]! | (1 << (i & 7));
    }
  }

  switch (mode) {
    case "range":
      scaleRange(values, missing, n, out, outMask);
      break;
    case "standardize":
      scaleStandardize(values, missing, n, out, outMask);
      break;
    case "robust":
      scaleRobust(values, missing, n, out, outMask);
      break;
  }

  return { values: out, missing: outMask };
}

function scaleRange(
  src: Float64Array | Int32Array,
  missing: MissingMask,
  n: number,
  out: Float64Array,
  outMask: Uint8Array,
): void {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    if (missing.isMissing(i)) continue;
    const v = src[i]!;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const range = hi - lo;
  for (let i = 0; i < n; i++) {
    if (missing.isMissing(i)) continue;
    out[i] = range > 0 ? (src[i]! - lo) / range : 0;
  }
}

function scaleStandardize(
  src: Float64Array | Int32Array,
  missing: MissingMask,
  n: number,
  out: Float64Array,
  outMask: Uint8Array,
): void {
  let count = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    if (missing.isMissing(i)) continue;
    sum += src[i]!;
    count++;
  }
  const mean = count > 0 ? sum / count : 0;
  let ss = 0;
  for (let i = 0; i < n; i++) {
    if (missing.isMissing(i)) continue;
    const d = src[i]! - mean;
    ss += d * d;
  }
  const sd = count > 1 ? Math.sqrt(ss / (count - 1)) : 0;
  for (let i = 0; i < n; i++) {
    if (missing.isMissing(i)) continue;
    out[i] = sd > 0 ? (src[i]! - mean) / sd : 0;
  }
}

function scaleRobust(
  src: Float64Array | Int32Array,
  missing: MissingMask,
  n: number,
  out: Float64Array,
  outMask: Uint8Array,
): void {
  const sorted: number[] = [];
  for (let i = 0; i < n; i++) {
    if (missing.isMissing(i)) continue;
    sorted.push(src[i]!);
  }
  if (sorted.length === 0) return;

  sorted.sort((a, b) => a - b);
  const median = quantile(sorted, 0.5);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const mad = medianAbsDev(sorted, median);
  for (let i = 0; i < n; i++) {
    if (missing.isMissing(i)) continue;
    out[i] = mad > 0 ? (src[i]! - median) / (mad * 1.4826) : 0;
  }
}

function quantile(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const idx = p * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (idx - lo) * (sorted[hi]! - sorted[lo]!);
}

function medianAbsDev(sorted: number[], median: number): number {
  const devs = sorted.map((v) => Math.abs(v - median));
  devs.sort((a, b) => a - b);
  return quantile(devs, 0.5);
}
